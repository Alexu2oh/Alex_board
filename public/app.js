
import { resizeObject, touchesStroke, pitchForStaffY, transposeChord } from './resize.js';

const $ = s => document.querySelector(s);
const viewport = $('#viewport');
const world = $('#world');
const objects = $('#objects');
const drawings = $('#drawings');
const cursors = $('#cursors');

const id = location.hash.slice(1);
const client = crypto.randomUUID();
const name = 'Участник ' + Math.floor(100 + Math.random() * 900);

const state = {
  items: new Map(),
  selected: null,
  tool: 'select',
  shape: null,
  color: 'yellow',
  x: 0,
  y: 0,
  zoom: 1,
  drag: null,
  online: false,
  pendingVocal: null
};

const api = `/api/boards/${encodeURIComponent(id)}`;

const hints = {
  select: 'Выберите объект и перетащите его по доске',
  hand: 'Перетаскивайте поле, чтобы двигать доску',
  sticky: 'Нажмите на поле, чтобы добавить стикер',
  text: 'Нажмите на поле, чтобы добавить текст',
  pen: 'Рисуйте по полю',
  eraser: 'Проведите по карандашной линии, чтобы стереть её',
  circle: 'Нажмите на поле, чтобы добавить круг',
  square: 'Нажмите на поле, чтобы добавить квадрат',
  staff: 'Нажмите на поле, чтобы добавить нотный стан',
  chord: 'Нажмите на поле, чтобы добавить аккорд',
  symbol: 'Нажмите на поле, чтобы добавить вокальную пометку'
};

function status(ok) {
  state.online = ok;
  $('#status').textContent = ok ? '● Подключено' : '● Нет соединения';
  $('#status').classList.toggle('offline', !ok);
}

async function request(path, options = {}) {
  try {
    const r = await fetch(path, options);
    if (!r.ok) throw Error('request failed: ' + r.status);
    return r;
  } catch (e) {
    status(false);
    throw e;
  }
}

async function put(item) {
  state.items.set(item.id, item);
  render();

  try {
    await request(api + '/objects', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item)
    });
  } catch {
    alert('Изменение не сохранилось. Проверьте соединение и повторите действие.');
  }
}

function transform() {
  world.style.transform =
    `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;

  $('#zoom').textContent = Math.round(state.zoom * 100) + '%';
}

const ink = {
  yellow: '#d99a00',
  pink: '#d34c78',
  blue: '#2673d1',
  green: '#23865a',
  purple: '#7056cc',
  dark: '#272938'
};

function showFlyout(menu, anchor, show) {
  if (!menu) return;

  menu.classList.toggle('open', !!show);
  menu.setAttribute('aria-hidden', String(!show));

  if (show && anchor) {
    const b = anchor.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();

    menu.style.top =
      Math.max(8, Math.min(b.top - v.top, v.height - 48)) + 'px';
  }
}

function palette() {
  const item = state.items.get(state.selected);
  const type = state.tool === 'select' ? item?.type : state.tool;

  const anchor =
    type === 'sticky' ? $('[data-tool=sticky]') :
    type === 'pen' ? $('[data-tool=pen]') :
    ['circle', 'square'].includes(type) ? $('#shapes') :
    null;

  showFlyout($('#palette'), anchor, !!anchor);

  document.querySelectorAll('[data-color]').forEach(b => {
    b.classList.toggle('active', b.dataset.color === state.color);
  });
}

function tool(t) {
  state.tool = t;

  document.querySelectorAll('[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === t);
  });

  $('#hint').textContent = hints[t] || 'Выберите место на доске';

  showFlyout($('#shapesMenu'), $('#shapes'), false);
  $('#shapes').setAttribute('aria-expanded', 'false');

  palette();
}

document.querySelectorAll('[data-color]').forEach(b => {
  b.addEventListener('click', () => {
    state.color = b.dataset.color;

    const item = state.items.get(state.selected);

    if (
      state.tool === 'select' &&
      item &&
      ['sticky', 'circle', 'square'].includes(item.type)
    ) {
      put({ ...item, color: state.color });
    }

    palette();
  });
});

function element(tag, cls, text) {
  const e = document.createElement(tag);

  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;

  return e;
}

let audioContext;

function tone(midi, seconds = .35, when = 0) {
  if (midi === null) return;

  audioContext ||= new AudioContext();
  audioContext.resume();

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const start = audioContext.currentTime + when;

  oscillator.type = 'sine';
  oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);

  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(.15, start + .02);
  gain.gain.exponentialRampToValueAtTime(
    .0001,
    start + Math.max(.05, seconds)
  );

  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + Math.max(.05, seconds) + .01);
}

function staff(item) {
  const wrap = element('div', 'staff-content');
  const bar = element('div', 'music-controls');
  const duration = element('select');

  duration.setAttribute('aria-label', 'Длительность следующей ноты');

  for (const [v, label] of [
    ['whole', '𝅝 целая'],
    ['half', '𝅗𝅥 половинная'],
    ['quarter', '♩ четверть'],
    ['eighth', '♪ восьмая'],
    ['rest', '𝄽 пауза']
  ]) {
    const o = element('option', '', label);
    o.value = v;
    duration.append(o);
  }

  duration.value = item.noteDuration || 'quarter';
  duration.onchange = () => put({ ...item, noteDuration: duration.value });

  const play = element('button', '', '▶');
  play.title = 'Прослушать ноты';
  play.setAttribute('aria-label', 'Прослушать ноты');

  play.onclick = () => {
    let time = 0;

    for (const n of [...(item.notes || [])].sort((a, b) => a.x - b.x)) {
      const len = ({
        whole: 2,
        half: 1,
        quarter: .5,
        eighth: .25,
        rest: .5
      })[n.duration] || .5;

      if (n.duration !== 'rest') tone(pitchForStaffY(n.y), len * .85, time);
      time += len;
    }
  };

  bar.append(duration, play);
  wrap.append(bar);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 250 90');
  svg.setAttribute(
    'aria-label',
    'Нажмите на нотный стан, чтобы поставить ноту'
  );

  for (let i = 0; i < 5; i++) {
    svg.insertAdjacentHTML(
      'beforeend',
      `<line x1="5" x2="245" y1="${24 + i * 10}" y2="${24 + i * 10}" stroke="currentColor"/>`
    );
  }

  svg.insertAdjacentHTML(
    'beforeend',
    '<text x="9" y="64" font-size="46">𝄞</text>'
  );

  for (const n of item.notes || []) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;

    const d = n.duration || 'quarter';

    if (d === 'rest') {
      svg.insertAdjacentHTML(
        'beforeend',
        `<text x="${n.x - 5}" y="58" font-size="25">𝄽</text>`
      );
      continue;
    }

    if (n.y >= 74) {
      svg.insertAdjacentHTML(
        'beforeend',
        `<line x1="${n.x - 10}" x2="${n.x + 10}" y1="74" y2="74" stroke="currentColor"/>`
      );
    }

    svg.insertAdjacentHTML(
      'beforeend',
      `<ellipse cx="${n.x}" cy="${n.y}" rx="6" ry="4" fill="${d === 'whole' || d === 'half' ? 'white' : 'currentColor'}" stroke="currentColor"/>`
    );

    if (d !== 'whole') {
      svg.insertAdjacentHTML(
        'beforeend',
        `<line x1="${n.x + 5}" x2="${n.x + 5}" y1="${n.y}" y2="${n.y - 25}" stroke="currentColor"/>`
      );
    }

    if (d === 'eighth') {
      svg.insertAdjacentHTML(
        'beforeend',
        `<path d="M ${n.x + 5} ${n.y - 25} q 12 4 6 16" fill="none" stroke="currentColor"/>`
      );
    }
  }

  svg.addEventListener('click', e => {
    if (state.tool !== 'select') return;

    const b = svg.getBoundingClientRect();
    const x = Math.round((e.clientX - b.left) * 250 / b.width);
    const y = Math.round(((e.clientY - b.top) * 90 / b.height - 24) / 5) * 5 + 24;

    if (x < 45 || x > 240 || y < 24 || y > 74) return;

    const notes = item.notes || [];
    const index = notes.findIndex(n =>
      Math.abs(n.x - x) < 9 &&
      Math.abs((n.duration === 'rest' ? 50 : n.y) - y) < 10
    );

    if (index >= 0) {
      put({ ...item, notes: notes.filter((_, i) => i !== index) });
      return;
    }

    const d = item.noteDuration || 'quarter';

    if (d !== 'rest') tone(pitchForStaffY(y));

    put({ ...item, notes: [...notes, { x, y, duration: d }] });
  });

  wrap.append(svg);
  return wrap;
}

function render() {
  transform();
  objects.replaceChildren();
  drawings.replaceChildren();

  for (const item of state.items.values()) {
    if (item.type === 'stroke') {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');

      p.setAttribute('points', (item.points || []).map(q => q.join(',')).join(' '));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', ink[item.color] || '#7056cc');
      p.setAttribute('stroke-width', '3');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('pointer-events', 'stroke');
      p.dataset.strokeId = item.id;

      if (item.id === state.selected) {
        p.style.filter = 'drop-shadow(0 0 3px #6556e8)';
      }

      drawings.append(p);
      continue;
    }

    const el = element(
      'section',
      `item ${item.type} ${item.color || ''}${item.id === state.selected ? ' selected' : ''}`
    );

    el.style.left = item.x + 'px';
    el.style.top = item.y + 'px';
    el.style.transform = `scale(${Number.isFinite(item.scale) ? item.scale : 1})`;
    el.dataset.id = item.id;

    // Images are real board objects and are saved through the existing API.
    if (item.type === 'image') {
      el.classList.add('image-item');
      el.style.width = (item.width || 320) + 'px';
      el.style.height = (item.height || 220) + 'px';

      const img = element('img', 'board-image');
      img.src = item.src || '';
      img.alt = 'Изображение на музыкальной доске';
      img.draggable = false;

      el.append(img);
      addResizeHandles(el);
      objects.append(el);
      continue;
    }

    if (item.type === 'circle' || item.type === 'square') {
      const shape = item.shape || item.type;
      el.classList.add('outline-shape', 'shape-' + shape);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 140 140');
      svg.setAttribute('preserveAspectRatio', 'none');

      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        ['circle', 'ellipse'].includes(shape)
          ? 'ellipse'
          : ['triangle', 'diamond'].includes(shape)
            ? 'polygon'
            : 'rect'
      );

      if (shape === 'circle' || shape === 'ellipse') {
        path.setAttribute('cx', '70');
        path.setAttribute('cy', '70');
        path.setAttribute('rx', '67');
        path.setAttribute('ry', '67');
      } else if (shape === 'triangle' || shape === 'diamond') {
        path.setAttribute(
          'points',
          shape === 'triangle'
            ? '70,4 136,136 4,136'
            : '70,4 136,70 70,136 4,70'
        );
      } else {
        path.setAttribute('x', '3');
        path.setAttribute('y', '3');
        path.setAttribute('width', '134');
        path.setAttribute('height', '134');
      }

      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', ink[item.color] || '#272938');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('pointer-events', 'stroke');

      svg.append(path);
      el.append(svg);
    }

    if (item.type === 'sticky' || item.type === 'text') {
      const t = element('textarea');
      t.value = item.text || '';
      t.readOnly = true;
      t.setAttribute('aria-label', 'Редактируемый текст');

      t.addEventListener('dblclick', () => {
        if (state.tool === 'select') {
          t.readOnly = false;
          t.focus();
        }
      });

      t.addEventListener('blur', () => {
        if (!t.readOnly) {
          t.readOnly = true;
          if (t.value !== item.text) put({ ...item, text: t.value });
        }
      });

      el.append(t);
    } else if (item.type === 'staff') {
      el.append(staff(item));
    } else if (item.type !== 'circle' && item.type !== 'square') {
      const s = element('select');
      s.setAttribute(
        'aria-label',
        item.type === 'chord' ? 'Аккорд' : 'Вокальная пометка'
      );

      const choices = item.type === 'chord'
        ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            .flatMap(root => ['', 'm', '7', 'maj7', 'm7', 'dim', 'aug', 'sus2', 'sus4']
              .map(quality => root + quality))
        : [
          '↗ выше', '↘ ниже', '’ вдох', 'выдох',
          'атака звука', 'легато', 'стаккато', 'акцент',
          'вибрато', '〰 глиссандо', '↗ переход',
          'дикция', 'тише', 'громче', 'куплет',
          'припев', 'бридж', 'задание'
        ];

      for (const value of choices) {
        const o = element('option', '', value);
        o.value = value;
        s.append(o);
      }

      const other = element('option', '', 'Другое…');
      other.value = '__custom__';
      s.append(other);

      const custom = !choices.includes(item.value);
      s.value = custom ? '__custom__' : item.value;

      const input = element('input', 'custom-value');
      input.type = 'text';
      input.placeholder = 'Введите свой текст';
      input.setAttribute('aria-label', 'Своё значение');
      input.value = custom ? item.value : '';
      input.hidden = !custom;

      function saveCustom() {
        const value = input.value.trim();

        if (value && value !== item.value) {
          put({ ...item, value });
        } else {
          render();
        }
      }

      input.addEventListener('blur', saveCustom);

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });

      s.addEventListener('change', () => {
        if (s.value === '__custom__') {
          input.hidden = false;
          input.focus();
        } else {
          put({ ...item, value: s.value });
        }
      });

      el.append(s, input);

      if (item.type === 'chord') {
        const controls = element('div', 'music-controls');

        for (const [label, delta] of [['−½', -1], ['+½', 1]]) {
          const button = element('button', '', label);
          button.title = delta > 0 ? 'На полутон выше' : 'На полутон ниже';

          button.onclick = () => {
            const value = transposeChord(item.value || '', delta);

            if (value) put({ ...item, value });
            else alert('Не удалось транспонировать аккорд. Например, Am7 или C/E.');
          };

          controls.append( button);
        }

        el.append(controls);
      }
    }

    addResizeHandles(el);
    objects.append(el);
  }
}

function addResizeHandles(el) {
  for (const direction of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    const handle = element('span', 'resize-handle resize-' + direction);
    handle.dataset.resize = direction;
    handle.setAttribute('aria-hidden', 'true');
    el.append(handle);
  }
}

function point(e) {
  const r = viewport.getBoundingClientRect();

  return {
    x: Math.round((e.clientX - r.left - state.x) / state.zoom),
    y: Math.round((e.clientY - r.top - state.y) / state.zoom)
  };
}

document.querySelectorAll('[data-tool]').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.shape) state.shape = b.dataset.shape;
    tool(b.dataset.tool);
  });
});

$('#shapes').addEventListener('click', () => {
  const open = !$('#shapesMenu').classList.contains('open');

  showFlyout($('#palette'), $('#shapes'), false);
  showFlyout($('#shapesMenu'), $('#shapes'), open);
  $('#shapes').setAttribute('aria-expanded', String(open));
});

viewport.addEventListener('pointerdown', e => {
  if (
    e.button !== 0 ||
    e.target.closest('.bottom') ||
    e.target.closest('#palette') ||
    e.target.closest('#contextMenu') ||
    e.target.closest('#shapesMenu') ||
    e.target.closest('#vocalPanel')
  ) return;

  $('#contextMenu').hidden = true;

  const p = point(e);
  const el = e.target.closest('.item');
  const stroke = e.target.closest('[data-stroke-id]');

  if (state.tool === 'select' && stroke) {
    state.selected = stroke.dataset.strokeId;
    palette();
    render();
    return;
  }

  if (state.tool === 'eraser') {
    state.drag = { kind: 'eraser', last: p };
    viewport.setPointerCapture(e.pointerId);
    erase(p, p);
    return;
  }

  if (state.tool === 'pen') {
    state.drag = {
      kind: 'pen',
      item: {
        id: crypto.randomUUID(),
        type: 'stroke',
        color: state.color,
        x: 0,
        y: 0,
        points: [[p.x, p.y]]
      }
    };

    viewport.setPointerCapture(e.pointerId);
    return;
  }

  if (state.tool === 'hand') {
    state.drag = {
      kind: 'pan',
      x: e.clientX,
      y: e.clientY,
      ox: state.x,
      oy: state.y
    };

    viewport.setPointerCapture(e.pointerId);
    return;
  }

  if (state.tool === 'select') {
    if (el) {
      state.selected = el.dataset.id;

      const selectedItem = state.items.get(state.selected);
      if (selectedItem?.color) state.color = selectedItem.color;

      palette();

      objects.querySelectorAll('.item').forEach(n => {
        n.classList.toggle('selected', n === el);
      });

      const handle = e.target.closest('[data-resize]');

      if (handle) {
        e.preventDefault();

        const item = state.items.get(state.selected);

        state.drag = {
          kind: 'resize',
          item: { ...item },
          original: { ...item },
          handle: handle.dataset.resize,
          width: el.offsetWidth,
          height: el.offsetHeight,
          x: e.clientX,
          y: e.clientY
        };

        viewport.setPointerCapture(e.pointerId);
      } else if (!e.target.closest('button,select,input,textarea:not([readonly])')) {
        const item = state.items.get(state.selected);

        state.drag = {
          kind: 'item-pending',
          item: { ...item },
          x: e.clientX,
          y: e.clientY,
          ox: item.x,
          oy: item.y
        };
      }
    } else {
      state.selected = null;
      palette();
      render();

      state.drag = {
        kind: 'pan',
        x: e.clientX,
        y: e.clientY,
        ox: state.x,
        oy: state.y
      };

      viewport.setPointerCapture(e.pointerId);
    }

    return;
  }

  const item = {
    id: crypto.randomUUID(),
    type: state.tool,
    x: p.x,
    y: p.y
  };

  if (item.type === 'sticky') {
    item.text = 'Новая заметка';
    item.color = state.color;
  }

  if (item.type === 'circle' || item.type === 'square') {
    item.color = state.color;
    item.shape = state.shape || item.type;
  }

  if (item.type === 'text') item.text = 'Дважды нажмите, чтобы написать';
  if (item.type === 'chord') item.value = 'C';

  if (item.type === 'symbol') {
    item.value = state.pendingVocal || '’ вдох';
    state.pendingVocal = null;
  }

  state.selected = item.id;
  tool('select');
  put(item);
});

let cursorTime = 0;

viewport.addEventListener('pointermove', e => {
  const p = point(e);
  const now = Date.now();

  if (state.online && now - cursorTime > 100) {
    cursorTime = now;

    fetch(api + '/cursor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: client, name, x: p.x, y: p.y })
    }).catch(() => {});
  }

  const d = state.drag;
  if (!d) return;

  if (d.kind === 'item-pending') {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;

    d.kind = 'item';

    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {}
  }

  if (d.kind === 'eraser') {
    erase(d.last, p);
    d.last = p;
  } else if (d.kind === 'pan') {
    state.x = d.ox + e.clientX - d.x;
    state.y = d.oy + e.clientY - d.y;
    transform();
  } else if (d.kind === 'pen') {
    if (d.item.points.length < 1000) d.item.points.push([p.x, p.y]);

    state.items.set(d.item.id, d.item);
    render();
  } else if (d.kind === 'resize') {
    d.item = resizeObject(
      d.original,
      d.handle,
      d.width,
      d.height,
      e.clientX - d.x,
      e.clientY - d.y,
      state.zoom
    );

    state.items.set(d.item.id, d.item);
    render();
  } else {
    d.item.x = Math.round(d.ox + (e.clientX - d.x) / state.zoom);
    d.item.y = Math.round(d.oy + (e.clientY - d.y) / state.zoom);

    state.items.set(d.item.id, d.item);
    render();
  }
});

function finish() {
  const d = state.drag;
  state.drag = null;

  if (d && !['pan', 'item-pending', 'eraser'].includes(d.kind)) {
    put(d.item);
  }
}

viewport.addEventListener('pointerup', finish);
viewport.addEventListener('pointercancel', finish);

const erasing = new Set();

function erase(from, to) {
  for (const item of state.items.values()) {
    if (
      item.type !== 'stroke' ||
      erasing.has(item.id) ||
      !touchesStroke(item.points || [], from, to, 12 / state.zoom)
    ) continue;

    erasing.add(item.id);

    request(api + '/objects/' + encodeURIComponent(item.id), {
      method: 'DELETE'
    }).then(() => {
      state.items.delete(item.id);
      if (state.selected === item.id) state.selected = null;
      render();
    }).catch(() => {
      alert('Не удалось стереть линию. Проверьте соединение.');
    }).finally(() => erasing.delete(item.id));
  }
}

async function deleteSelected() {
  if (!state.selected) return;

  const selectedId = state.selected;

  try {
    await request(api + '/objects/' + encodeURIComponent(selectedId), {
      method: 'DELETE'
    });

    state.items.delete(selectedId);
    if (state.selected === selectedId) state.selected = null;

    palette();
    render();
  } catch {
    alert('Не удалось удалить объект.');
  }
}

$('#delete').onclick = deleteSelected;
$('#contextDelete').onclick = () => {
  $('#contextMenu').hidden = true;
  deleteSelected();
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    $('#contextMenu').hidden = true;
    return;
  }

  if (
    e.key !== 'Delete' ||
    e.target.closest('input,textarea:not([readonly]),select,[contenteditable="true"]') ||
    document.querySelector('dialog[open]')
  ) return;

  if (state.selected) {
    e.preventDefault();
    deleteSelected();
  }
});

// Right mouse button always pans the board.
viewport.addEventListener('contextmenu', e => e.preventDefault());

viewport.addEventListener('pointerdown', e => {
  if (e.button !== 2) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  $('#contextMenu').hidden = true;

  state.drag = {
    kind: 'pan',
    x: e.clientX,
    y: e.clientY,
    ox: state.x,
    oy: state.y
  };

  try {
    viewport.setPointerCapture(e.pointerId);
  } catch {}
}, true);

function zoomAt(clientX, clientY, factor) {
  const r = viewport.getBoundingClientRect();
  const px = clientX - r.left;
  const py = clientY - r.top;
  const old = state.zoom;
  const next = Math.max(.2, Math.min(4, old * factor));

  state.x = px - (px - state.x) * next / old;
  state.y = py - (py - state.y) * next / old;
  state.zoom = next;

  transform();
}

// Ctrl + wheel / trackpad pinch zooms around the pointer.
viewport.addEventListener('wheel', e => {
  if (e.target.closest('button,input,textarea,select')) return;

  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .01));
  } else if (state.tool === 'hand' || e.shiftKey) {
    e.preventDefault();
    state.x -= e.deltaX;
    state.y -= e.deltaY;
    transform();
  }
}, { passive: false });

for (const [selector, delta] of [['#plus', .15], ['#minus', -.15]]) {
  $(selector).onclick = () => {
    const next = Math.max(.2, Math.min(4, state.zoom + delta));
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;

    state.x = cx - (cx - state.x) * next / state.zoom;
    state.y = cy - (cy - state.y) * next / state.zoom;
    state.zoom = next;

    transform();
  };
}

$('#zoom').addEventListener('click', () => {
  state.zoom = 1;
  state.x = 0;
  state.y = 0;
  transform();
});

$('#fitBoard')?.addEventListener('click', () => {
  const items = [...state.items.values()];

  if (!items.length) {
    state.zoom = 1;
    state.x = 0;
    state.y = 0;
    transform();
    return;
  }

  const minX = Math.min(...items.map(o => o.x));
  const minY = Math.min(...items.map(o => o.y));
  const maxX = Math.max(...items.map(o => o.x + (o.width || 280)));
  const maxY = Math.max(...items.map(o => o.y + (o.height || 150)));
  const pad = 80;

  state.zoom = Math.max(
    .2,
    Math.min(
      1.5,
      (viewport.clientWidth - pad * 2) / Math.max(1, maxX - minX),
      (viewport.clientHeight - pad * 2) / Math.max(1, maxY - minY)
    )
  );

  state.x = (viewport.clientWidth - (maxX - minX) * state.zoom) / 2 - minX * state.zoom;
  state.y = (viewport.clientHeight - (maxY - minY) * state.zoom) / 2 - minY * state.zoom;

  transform();
});

// Board catalogue.
const catalogKey = 'fraza-board-catalog-v1';

function boards() {
  try {
    const value = JSON.parse(localStorage.getItem(catalogKey) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveBoards(list) {
  localStorage.setItem(catalogKey, JSON.stringify(list));
}

if (
  id &&
  /^[A-Za-z0-9_-]{32}$/.test(id) &&
  !boards().some(b => b.id === id)
) {
  saveBoards([...boards(), { id, name: 'Без названия', icon: '♫' }]);
}

function showCatalog() {
  const list = $('#boardList');
  list.replaceChildren();

  for (const b of boards()) {
    const row = element('div', 'board-row');
    const open = element('button', 'board-open', `${b.icon}  ${b.name}`);

    open.onclick = () => {
      location.href = '/#' + b.id;
      location.reload();
    };

    const remove = element('button', 'board-remove', 'Удалить');

    remove.onclick = async () => {
      if (!confirm(`Удалить доску «${b.name}» и всё её содержимое? Это действие нельзя отменить.`)) {
        return;
      }

      try {
        await request('/api/boards/' + encodeURIComponent(b.id), {
          method: 'DELETE'
        });

        saveBoards(boards().filter(x => x.id !== b.id));

        if (id === b.id) {
          location.href = '/';
          location.reload();
        } else {
          showCatalog();
        }
      } catch {
        alert('Не удалось удалить доску. Проверьте соединение.');
      }
    };

    row.append(open, remove);
    list.append(row);
  }

  if (!list.children.length) {
    list.append(element('p', 'sub', 'Здесь появятся ваши доски.'));
  }

  if (!$('#catalog').open) $('#catalog').showModal();
}

function create() {
  if ($('#catalog').open) $('#catalog').close();
  if ($('#welcome').open) $('#welcome').close();

  $('#boardName').value = '';
  $('#boardCreate').showModal();
}

$('#catalogOpen').onclick = showCatalog;
$('#welcomeCatalog').onclick = () => {
  $('#welcome').close();
  showCatalog();
};
$('#catalogClose').onclick = () => $('#catalog').close();
$('#catalogCreate').onclick = create;
$('#create').onclick = create;
$('#new').onclick = create;
$('#cancelCreate').onclick = () => $('#boardCreate').close();

$('#confirmCreate').onclick = async () => {
  const title = $('#boardName').value.trim();

  if (!title) {
    $('#boardName').focus();
    return;
  }

  try {
    const r = await request('/api/boards', { method: 'POST' });
    const board = await r.json();

    saveBoards([
      ...boards(),
      { id: board.id, name: title, icon: $('#boardIcon').value }
    ]);

    location.href = '/#' + board.id;
    location.reload();
  } catch {
    alert('Не удалось создать доску. Проверьте сервер.');
  }
};

$('#share').onclick = () => {
  $('#shareLink').value = location.href;
  $('#shareDialog').showModal();
};

$('#closeShare').onclick = () => $('#shareDialog').close();

$('#copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('#copyStatus').textContent = 'Ссылка скопирована';
  } catch {
    $('#shareLink').select();
    $('#copyStatus').textContent = 'Выделите и скопируйте ссылку вручную';
  }
};

// Other participants' cursors.
const cursorNodes = new Map();

function showCursor(p) {
  if (p.id === client) return;

  let c = cursorNodes.get(p.id);

  if (!c) {
    const el = element('div', 'cursor');
    el.append(document.createTextNode('➤ '), element('span', '', p.name));

    c = { el };
    cursorNodes.set(p.id, c);
    cursors.append(el);
  }

  c.el.style.left = p.x + 'px';
  c.el.style.top = p.y + 'px';

  clearTimeout(c.timer);

  c.timer = setTimeout(() => {
    c.el.remove();
    cursorNodes.delete(p.id);
  }, 5000);
}

async function load() {
  const r = await request(api);
  const data = await r.json();

  state.items = new Map(data.objects.map(o => [o.id, o]));
  render();
}

if (!id) {
  status(false);
  $('#welcome').showModal();
} else if (!/^[A-Za-z0-9_-]{32}$/.test(id)) {
  status(false);
  alert('Неверная ссылка на доску.');
  $('#welcome').showModal();
} else {
  let loading = false;
  let queued = [];

  function receive(v) {
    if (v.kind === 'cursor') return showCursor(v);

    if (v.kind === 'put') {
      if (state.drag?.item?.id === v.object.id) return;
      state.items.set(v.object.id, v.object);
    }

    if (v.kind === 'delete') state.items.delete(v.id);

    if (!document.activeElement?.matches('textarea:not([readonly]), input.custom-value')) {
      render();
    }
  }

  const events = new EventSource(api + '/events');

  events.onopen = async () => {
    loading = true;
    queued = [];

    try {
      await load();

      for (const v of queued) receive(v);

      queued = [];
      loading = false;
      status(true);
    } catch {
      loading = false;
      status(false);

      if (!$('#welcome').open) $('#welcome').showModal();
    }
  };

  events.onerror = () => status(false);

  events.onmessage = e => {
    let v;

    try {
      v = JSON.parse(e.data);
    } catch {
      return;
    }

    if (loading) queued.push(v);
    else receive(v);
  };
}

// --- Vocal technique library: 50 annotations ---
const vocalEffects = [
  ['Глиссандо', 'Плавное движение по высоте'],
  ['Слайд вверх', 'Скользящее движение вверх'],
  ['Слайд вниз', 'Скользящее движение вниз'],
  ['Вибрато', 'Колебание высоты звука'],
  ['Широкое вибрато', 'Широкая амплитуда колебаний'],
  ['Узкое вибрато', 'Небольшие колебания высоты'],
  ['Йодль', 'Резкое переключение регистров'],
  ['Портаменто', 'Плавный переход между нотами'],
  ['Мелизм', 'Несколько нот на одном слоге'],
  ['Ран', 'Быстрый пассаж нот'],
  ['Трилль', 'Чередование соседних нот'],
  ['Мордент', 'Короткое мелодическое украшение'],
  ['Форшлаг', 'Короткая вспомогательная нота'],
  ['Апподжиатура', 'Выразительная вспомогательная нота'],
  ['Бенд вверх', 'Подтягивание высоты ноты'],
  ['Бенд вниз', 'Опускание высоты ноты'],
  ['Фальцет', 'Лёгкое звучание верхнего регистра'],
  ['Головной регистр', 'Звучание верхнего регистра'],
  ['Грудной регистр', 'Плотное низкое звучание'],
  ['Микст', 'Смешение грудного и головного звучания'],
  ['Переход регистра', 'Смена механизма голосообразования'],
  ['Белтинг', 'Мощное эстрадное звучание'],
  ['Мягкая атака', 'Плавное начало звука'],
  ['Твёрдая атака', 'Чёткое начало звука'],
  ['Придыхательная атака', 'Начало с придыханием'],
  ['Глиссандо с придыханием', 'Скользящий воздушный звук'],
  ['Легато', 'Связное исполнение'],
  ['Стаккато', 'Короткие отдельные звуки'],
  ['Акцент', 'Подчёркнутая нота'],
  ['Сфорцандо', 'Резкий динамический акцент'],
  ['Крещендо', 'Постепенное усиление'],
  ['Диминуэндо', 'Постепенное затихание'],
  ['Свелл', 'Плавное нарастание и спад'],
  ['Вокальный фрай', 'Низкое скрипучее звучание'],
  ['Распевный фрай', 'Фрай перед основным звуком'],
  ['Шёпот', 'Шёпотная подача'],
  ['Придыхание', 'Воздушная составляющая звука'],
  ['Вокальный вздох', 'Выразительный вдох или выдох'],
  ['Субтон', 'Мягкое воздушное звучание'],
  ['Тванг', 'Яркий сфокусированный тембр'],
  ['Назальный оттенок', 'Носовой резонансный оттенок'],
  ['Открытый звук', 'Более открытая артикуляция'],
  ['Прикрытый звук', 'Более прикрытая артикуляция'],
  ['Смена гласной', 'Переход между гласными'],
  ['Ритмический акцент', 'Подчёркивание ритма'],
  ['Синкопа', 'Акцент между долями'],
  ['Ритардандо', 'Постепенное замедление'],
  ['Акселерандо', 'Постепенное ускорение'],
  ['Пауза', 'Остановка звучания'],
  ['Снятие звука', 'Контролируемое окончание ноты']
];

const vocalPanel = $('#vocalPanel');
const vocalList = $('#vocalEffectList');
const vocalCategories = $('#vocalCategories');

if (vocalPanel && vocalList && vocalCategories) {
  const categories = {
    'Все': vocalEffects,
    'Высота': vocalEffects.slice(0, 16),
    'Регистры': vocalEffects.slice(16, 22),
    'Атака и тембр': vocalEffects.slice(22, 44),
    'Ритм и фразировка': vocalEffects.slice(44)
  };

  let activeCategory = 'Все';

  function renderVocalEffects() {
    vocalCategories.replaceChildren();

    for (const category of Object.keys(categories)) {
      const b = element(
        'button',
        category === activeCategory ? 'active' : '',
        category
      );

      b.type = 'button';

      b.onclick = () => {
        activeCategory = category;
        renderVocalEffects();
      };

      vocalCategories.append(b);
    }

    const query = ($('#vocalSearch')?.value || '')
      .trim()
      .toLocaleLowerCase('ru');

    vocalList.replaceChildren();

    for (const [label, description] of categories[activeCategory]) {
      if (
        query &&
        !label.toLocaleLowerCase('ru').includes(query) &&
        !description.toLocaleLowerCase('ru').includes(query)
      ) continue;

      const b = element('button', 'vocal-effect');
      b.type = 'button';

      b.append(
        element('strong', '', label),
        element('span', '', description)
      );

      b.onclick = () => {
        state.pendingVocal = label;
        tool('symbol');

        vocalPanel.classList.remove('open');
        vocalPanel.setAttribute('aria-hidden', 'true');

        $('#hint').textContent = `Нажмите на доску, чтобы разместить: ${label}`;
      };

      vocalList.append(b);
    }
  }

  renderVocalEffects();

  $('#vocalSearch')?.addEventListener('input', renderVocalEffects);

  $('#vocalEffects')?.addEventListener('click', () => {
    const open = !vocalPanel.classList.contains('open');

    vocalPanel.classList.toggle('open', open);
    vocalPanel.setAttribute('aria-hidden', String(!open));
  });

  $('#closeVocalEffects')?.addEventListener('click', () => {
    vocalPanel.classList.remove('open');
    vocalPanel.setAttribute('aria-hidden', 'true');
  });
}

// --- Upload an image and place it on the board ---
const imageInput = $('#imageInput');

$('#uploadImage')?.addEventListener('click', () => imageInput?.click());

imageInput?.addEventListener('change', async () => {
  const file = imageInput.files?.[0];
  imageInput.value = '';

  if (!file) return;

  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    alert('Выбери PNG, JPG, WebP или GIF.');
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    alert('Максимальный размер изображения — 8 МБ.');
    return;
  }

  try {
    const response = await request(api + '/objects/image-upload', {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file
    });

    const result = await response.json();

    const dimensions = await new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });

      img.onerror = reject;
      img.src = result.url;
    });

    const scale = Math.min(
      1,
      700 / dimensions.width,
      550 / dimensions.height
    );

    const r = viewport.getBoundingClientRect();

    const item = {
      id: crypto.randomUUID(),
      type: 'image',
      x: Math.round((r.width / 2 - state.x) / state.zoom),
      y: Math.round((r.height / 2 - state.y) / state.zoom),
      src: result.url,
      width: Math.max(80, Math.round(dimensions.width * scale)),
      height: Math.max(60, Math.round(dimensions.height * scale)),
      color: 'dark'
    };

    state.selected = item.id;
    tool('select');

    await put(item);
  } catch (error) {
    console.error(error);

    alert(
      'Не удалось загрузить изображение. Проверь сервер и постоянное хранилище Render.'
    );
  }
});
