
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const allowed = new Set([
  'sticky', 'text', 'staff', 'chord', 'symbol',
  'stroke', 'circle', 'square', 'image'
]);

const token = /^[A-Za-z0-9_-]{32}$/;
const objectId = /^[A-Za-z0-9_-]{1,80}$/;

const imageTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

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

      if (size > 100_000) {
        reject(new Error('too large'));
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
  return o &&
    typeof o === 'object' &&
    objectId.test(o.id || '') &&
    allowed.has(o.type) &&
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Math.abs(o.x) < 1e6 &&
    Math.abs(o.y) < 1e6 &&
    JSON.stringify(o).length < 50000;
}

export function createServer({
  database = process.env.DB_PATH ||
    join(here, 'data', 'boards.sqlite')
} = {}) {
  if (database !== ':memory:') {
    mkdirSync(dirname(database), { recursive: true });
  }

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
      PRIMARY KEY(board_id, id)
    );
  `);

  const subscribers = new Map();

  // Uploads live alongside the configured database.
  const uploadDir = join(dirname(database), 'uploads');
  mkdirSync(uploadDir, { recursive: true });

  const exists = id =>
    token.test(id) &&
    !!db.prepare('SELECT id FROM boards WHERE id=?').get(id);

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
        new URL(req.headers.origin).host !== req.headers.host
      ) {
        return json(res, 403, { error: 'origin forbidden' });
      }

      if (req.method === 'POST' && path === '/api/boards') {
        const id = randomBytes(24).toString('base64url');

        db.prepare('INSERT INTO boards(id) VALUES(?)').run(id);

        return json(res, 201, { id });
      }

      // Serve uploaded images.
      if (req.method === 'GET') {
        const uploadMatch = path.match(
          /^\/uploads\/([a-f0-9]{36}\.(?:png|jpg|webp|gif))$/
        );

        if (uploadMatch) {
          const file = join(uploadDir, uploadMatch[1]);

          if (!existsSync(file)) {
            return json(res, 404, { error: 'image not found' });
          }

          const ext = file.split('.').pop();
          const mime = {
            png: 'image/png',
            jpg: 'image/jpeg',
            webp: 'image/webp',
            gif: 'image/gif'
          }[ext];

          res.writeHead(200, {
            'content-type': mime,
            'x-content-type-options': 'nosniff',
            'cache-control': 'public, max-age=31536000, immutable'
          });

          return res.end(readFileSync(file));
        }

        const files = {
          '/': ['index.html', 'text/html; charset=utf-8'],
          '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
          '/resize.js': ['resize.js', 'text/javascript; charset=utf-8'],
          '/style.css': ['style.css', 'text/css; charset=utf-8']
        };

        const f = files[path];

        if (f) {
          res.writeHead(200, {
            'content-type': f[1],
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-cache'
          });

          return res.end(readFileSync(join(here, 'public', f[0])));
        }
      }

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
            db.prepare('DELETE FROM objects WHERE board_id=?').run(id);
            db.prepare('DELETE FROM boards WHERE id=?').run(id);
            db.exec('COMMIT');
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }

          publish(id, { kind: 'board-deleted' });

          for (const client of subscribers.get(id) || []) {
            client.end();
          }

          return json(res, 200, { ok: true });
        }

        if (req.method === 'GET' && !part) {
          return json(res, 200, {
            objects: db.prepare(
              'SELECT data FROM objects WHERE board_id=?'
            ).all(id).map(row => JSON.parse(row.data))
          });
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

        // Upload PNG, JPG, WebP or GIF (maximum 8 MB).
        if (
          req.method === 'POST' &&
          part === 'objects' &&
          oid === 'image-upload'
        ) {
          const mime = (req.headers['content-type'] || '')
            .split(';')[0]
            .trim()
            .toLowerCase();

          const ext = imageTypes.get(mime);

          if (!ext) {
            return json(res, 415, {
              error: 'unsupported image type'
            });
          }

          const chunks = [];
          let size = 0;

          for await (const chunk of req) {
            size += chunk.length;

            if (size > 8 * 1024 * 1024) {
              return json(res, 413, {
                error: 'image too large; maximum 8 MB'
              });
            }

            chunks.push(chunk);
          }

          if (!size) {
            return json(res, 400, { error: 'empty image' });
          }

          const file = randomBytes(18).toString('hex') + '.' + ext;

          writeFileSync(
            join(uploadDir, file),
            Buffer.concat(chunks),
            { flag: 'wx' }
          );

          return json(res, 201, {
            url: '/uploads/' + file
          });
        }

        if (
          req.method === 'PUT' &&
          part === 'objects' &&
          !oid
        ) {
          const o = await readBody(req);

          if (!validObject(o)) {
            return json(res, 400, { error: 'invalid object' });
          }

          db.prepare(`
            INSERT INTO objects(board_id, id, data)
            VALUES(?, ?, ?)
            ON CONFLICT(board_id, id)
            DO UPDATE SET data=excluded.data
          `).run(id, o.id, JSON.stringify(o));

          publish(id, { kind: 'put', object: o });

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

          publish(id, { kind: 'delete', id: oid });

          return json(res, 200, { ok: true });
        }

        if (req.method === 'POST' && part === 'cursor') {
          const p = await readBody(req);

          if (
            !p ||
            !objectId.test(p.id || '') ||
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            typeof p.name !== 'string' ||
            p.name.length > 30
          ) {
            return json(res, 400, { error: 'invalid cursor' });
          }

          publish(id, { kind: 'cursor', ...p });

          return json(res, 200, { ok: true });
        }

        return json(res, 405, { error: 'method not allowed' });
      }

      return json(res, 404, { error: 'not found' });
    } catch (error) {
      if (!res.headersSent) {
        json(res, 400, { error: 'invalid request' });
      } else {
        res.end();
      }
    }
  });

  server.on('close', () => {
    for (const clients of subscribers.values()) {
      for (const res of clients) res.end();
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
    () => console.log(
      `Фраза listening on port ${server.address().port}`
    )
  );
}
