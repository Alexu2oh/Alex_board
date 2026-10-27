
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  createWriteStream
} from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';

const here = dirname(fileURLToPath(import.meta.url));

const allowed = new Set([
  'sticky',
  'text',
  'staff',
  'chord',
  'symbol',
  'stroke',
  'circle',
  'square',
  'image'
]);

const token = /^[A-Za-z0-9_-]{32}$/;
const objectId = /^[A-Za-z0-9_-]{1,80}$/;
const imageName = /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/;

const MAX_JSON_SIZE = 100_000;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const imageTypes = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(data));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;

      if (size > MAX_JSON_SIZE) {
        reject(new Error('request too large'));
        req.destroy();
        return;
      }

      data += chunk;
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid json'));
      }
    });

    req.on('error', reject);
  });
}

function validObject(o) {
  return Boolean(
    o &&
    typeof o === 'object' &&
    objectId.test(o.id || '') &&
    allowed.has(o.type) &&
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Math.abs(o.x) < 1e6 &&
    Math.abs(o.y) < 1e6 &&
    JSON.stringify(o).length < 50000 &&
    (
      o.type !== 'image' ||
      (
        typeof o.src === 'string' &&
        o.src.startsWith('/uploads/') &&
        imageName.test(basename(o.src)) &&
        Number.isFinite(o.width) &&
        Number.isFinite(o.height) &&
        o.width > 0 &&
        o.height > 0 &&
        o.width <= 10000 &&
        o.height <= 10000
      )
    )
  );
}

export function createServer({
  database = process.env.DB_PATH || join(here, 'data', 'boards.sqlite'),
  uploadDir = process.env.UPLOAD_DIR || join(here, 'data', 'uploads')
} = {}) {
  if (database !== ':memory:') {
    mkdirSync(dirname(database), { recursive: true });
  }

  mkdirSync(uploadDir, { recursive: true });

  const db = new DatabaseSync(database);

  db.exec(`
    PRAGMA journal_mode=WAL;

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS objects (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (board_id, id)
    );
  `);

  const subscribers = new Map();

  const exists = id =>
    token.test(id) &&
    Boolean(db.prepare('SELECT id FROM boards WHERE id=?').get(id));

  const publish = (id, event) => {
    for (const res of subscribers.get(id) || []) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;

      res.setHeader('Referrer-Policy', 'no-referrer');

      if (
        req.method !== 'GET' &&
        req.headers.origin &&
        req.headers.host &&
        new URL(req.headers.origin).host !== req.headers.host
      ) {
        return json(res, 403, { error: 'origin forbidden' });
      }

      // Создание доски
      if (req.method === 'POST' && path === '/api/boards') {
        const id = randomBytes(24).toString('base64url');

        db.prepare('INSERT INTO boards(id) VALUES(?)').run(id);

        return json(res, 201, { id });
      }

      // Загрузка изображения:
      // POST /api/boards/:id/objects/image-upload
      const uploadMatch = path.match(
        /^\/api\/boards\/([^/]+)\/objects\/image-upload$/
      );

      if (req.method === 'POST' && uploadMatch) {
        const [, boardId] = uploadMatch;

        if (!exists(boardId)) {
          return json(res, 404, { error: 'board not found' });
        }

        const contentType = String(
          req.headers['content-type'] || ''
        ).split(';')[0].trim().toLowerCase();

        const extension = imageTypes[contentType];

        if (!extension) {
          return json(res, 415, {
            error: 'unsupported image type'
          });
        }

        const chunks = [];
        let totalSize = 0;

        for await (const chunk of req) {
          totalSize += chunk.length;

          if (totalSize > MAX_IMAGE_SIZE) {
            return json(res, 413, {
              error: 'image too large; maximum is 8 MB'
            });
          }

          chunks.push(chunk);
        }

        if (totalSize === 0) {
          return json(res, 400, { error: 'empty image' });
        }

        const buffer = Buffer.concat(chunks);

        // Проверяем сигнатуру файла, а не только Content-Type.
        const signatures = {
          png: buffer.length >= 8 &&
            buffer.subarray(0, 8).equals(
              Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
            ),

          jpg: buffer.length >= 3 &&
            buffer[0] === 0xff &&
            buffer[1] === 0xd8 &&
            buffer[2] === 0xff,

          webp: buffer.length >= 12 &&
            buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP',

          gif: buffer.length >= 6 &&
            ['GIF87a', 'GIF89a'].includes(
              buffer.toString('ascii', 0, 6)
            )
        };

        if (!signatures[extension]) {
          return json(res, 400, {
            error: 'invalid image file'
          });
        }

        const filename =
          `${randomBytes(16).toString('hex')}.${extension}`;

        const destination = join(uploadDir, filename);

        writeFileSync(destination, buffer, { flag: 'wx' });

        return json(res, 201, {
          url: `/uploads/${filename}`
        });
      }

      // API досок и объектов
      const match = path.match(
        /^\/api\/boards\/([^/]+)(?:\/(objects|events|cursor)(?:\/([^/]+))?)?$/
      );

      if (match) {
        const [, id, part, oid] = match;

        if (!exists(id)) {
          return json(res, 404, { error: 'board not found' });
        }

        if (req.method === 'DELETE' && !part) {
          db.exec('BEGIN');

          try {
            db.prepare(
              'DELETE FROM objects WHERE board_id=?'
            ).run(id);

            db.prepare(
              'DELETE FROM boards WHERE id=?'
            ).run(id);

            db.exec('COMMIT');
          } catch (error) {
            db.exec('ROLLBACK');
            throw error;
          }

          publish(id, { kind: 'board-deleted' });

          for (const client of subscribers.get(id) || []) {
            client.end();
          }

          return json(res, 200, { ok: true });
        }

        if (req.method === 'GET' && !part) {
          const objects = db.prepare(
            'SELECT data FROM objects WHERE board_id=?'
          ).all(id).map(row => JSON.parse(row.data));

          return json(res, 200, { objects });
        }

        if (req.method === 'GET' && part === 'events') {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache, no-transform',
            'connection': 'keep-alive',
            'x-accel-buffering': 'no'
          });

          res.write(': connected\n\n');

          if (!subscribers.has(id)) {
            subscribers.set(id, new Set());
          }

          subscribers.get(id).add(res);

          const timer = setInterval(
            () => res.write(': keepalive\n\n'),
            20000
          );

          req.on('close', () => {
            clearInterval(timer);

            subscribers.get(id)?.delete(res);

            if (!subscribers.get(id)?.size) {
              subscribers.delete(id);
            }
          });

          return;
        }

        if (
          req.method === 'PUT' &&
          part === 'objects' &&
          !oid
        ) {
          const object = await readBody(req);

          if (!validObject(object)) {
            return json(res, 400, {
              error: 'invalid object'
            });
          }

          db.prepare(`
            INSERT INTO objects(board_id,id,data)
            VALUES(?,?,?)
            ON CONFLICT(board_id,id)
            DO UPDATE SET data=excluded.data
          `).run(id, object.id, JSON.stringify(object));

          publish(id, {
            kind: 'put',
            object
          });

          return json(res, 200, { ok: true });
        }

        if (
          req.method === 'DELETE' &&
          part === 'objects' &&
          objectId.test(oid || '')
        ) {
          db.prepare(
            'DELETE FROM objects WHERE board_id=? AND id=?'
          ).run(id, oid);

          publish(id, {
            kind: 'delete',
            id: oid
          });

          return json(res, 200, { ok: true });
        }

        if (req.method === 'POST' && part === 'cursor') {
          const cursor = await readBody(req);

          if (
            !cursor ||
            !objectId.test(cursor.id || '') ||
            !Number.isFinite(cursor.x) ||
            !Number.isFinite(cursor.y) ||
            typeof cursor.name !== 'string' ||
            cursor.name.length > 30
          ) {
            return json(res, 400, {
              error: 'invalid cursor'
            });
          }

          publish(id, {
            kind: 'cursor',
            ...cursor
          });

          return json(res, 200, { ok: true });
        }

        return json(res, 405, {
          error: 'method not allowed'
        });
      }

      // Раздача загруженных изображений
      if (req.method === 'GET' && path.startsWith('/uploads/')) {
        const filename = path.slice('/uploads/'.length);

        if (!imageName.test(filename)) {
          return json(res, 404, { error: 'not found' });
        }

        const filepath = join(uploadDir, filename);

        let data;

        try {
          data = readFileSync(filepath);
        } catch {
          return json(res, 404, { error: 'image not found' });
        }

        const extension = filename.split('.').pop();

        const mime = {
          png: 'image/png',
          jpg: 'image/jpeg',
          webp: 'image/webp',
          gif: 'image/gif'
        }[extension];

        res.writeHead(200, {
          'content-type': mime,
          'content-length': data.length,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff'
        });

        return res.end(data);
      }

      // Статические файлы приложения
      if (req.method === 'GET') {
        const files = {
          '/': ['index.html', 'text/html; charset=utf-8'],
          '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
          '/resize.js': ['resize.js', 'text/javascript; charset=utf-8'],
          '/style.css': ['style.css', 'text/css; charset=utf-8']
        };

        const file = files[path];

        if (file) {
          res.writeHead(200, {
            'content-type': file[1],
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-cache'
          });

          return res.end(
            readFileSync(join(here, 'public', file[0]))
          );
        }
      }

      return json(res, 404, { error: 'not found' });
    } catch (error) {
      console.error('Request error:', error);

      if (!res.headersSent) {
        json(res, 400, { error: 'invalid request' });
      } else {
        res.end();
      }
    }
  });

  server.on('close', () => {
    for (const clients of subscribers.values()) {
      for (const res of clients) {
        res.end();
      }
    }

    db.close();
  });

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createServer();

  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || '0.0.0.0',
    () => {
      console.log(
        `Фраза listening on port ${server.address().port}`
      );
    }
  );
}
