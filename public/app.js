const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;

let scale = 1;
let panX = 0;
let panY = 0;

let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let isSpacePressed = false;

let elements = [];
let currentMode = 'select'; // select, draw, eraser
let isDrawing = false;
let currentStroke = [];
let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Полный список из 50 вокальных эффектов и значков
const vocalEffects = [
  "Вибрато классическое", "Вибрато широкое", "Вибрато частое", "Глиссандо вверх", "Глиссандо вниз",
  "Пиано (p)", "Форте (f)", "Меццо-пиано (mp)", "Меццо-форте (mf)", "Пианиссимо (pp)",
  "Фортиссимо (ff)", "Акцент (>)", "Стендо (staccato)", "Легато (legato)", "Портаменто",
  "Субтон (subtone)", "Фальцет (falsetto)", "Тванг (twang)", "Белтинг (belting)", "Йодль (yodel)",
  "Микст (mixed voice)", "Грудной регистр", "Головной регистр", "Штрабас (vocal fry)", "Овердрайв",
  "Драйв / Скрим", "Фрай", "Йодль-модуляция", "Мелизм плавный", "Мелизм быстрый",
  "Форшлаг", "Мордент", "Трель", "Вибрато затухающее", "Вибрато нарастающее",
  "Нос. резонанс (nasal)", "Зевок (open throat)", "Атака твердая", "Атака мягкая", "Атака придыхательная",
  "Фразировка вверх", "Фразировка вниз", "Динамическая волна", "Пауза / Цезура", "Фермата",
  "Ритмический акцент", "Синкопа", "Вибрато вибрато", "Глиссандо хроматическое", "Финал / Кода"
];

// Заполняем выпадающий список эффектов в HTML
const effectsContainer = document.getElementById('effects-list');
vocalEffects.forEach(effect => {
  const div = document.createElement('div');
  div.className = 'effect-item';
  div.innerText = effect;
  div.onclick = () => addVocalEffect(effect);
  effectsContainer.appendChild(div);
});

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  render();
}
window.addEventListener('resize', resizeCanvas);

function setMode(mode) {
  currentMode = mode;
  document.getElementById('btn-select').classList.toggle('active', mode === 'select');
  document.getElementById('btn-draw').classList.toggle('active', mode === 'draw');
  document.getElementById('btn-eraser').classList.toggle('active', mode === 'eraser');
}

function clearBoard() {
  if (confirm('Очистить всю доску?')) {
    elements = [];
    render();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !isSpacePressed) {
    isSpacePressed = true;
    document.body.style.cursor = 'grab';
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    isSpacePressed = false;
    document.body.style.cursor = 'default';
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = 1.08;
  const mouseX = e.clientX;
  const mouseY = e.clientY;

  let newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
  newScale = Math.min(Math.max(0.15, newScale), 6);

  panX = mouseX - (mouseX - panX) * (newScale / scale);
  panY = mouseY - (mouseY - panY) * (newScale / scale);
  scale = newScale;

  render();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  if (isSpacePressed || e.button === 1) {
    isPanning = true;
    startPanX = e.clientX - panX;
    startPanY = e.clientY - panY;
    document.body.style.cursor = 'grabbing';
    return;
  }

  const worldPos = screenToWorld(e.clientX, e.clientY);

  if (currentMode === 'select') {
    // Ищем элемент под курсором для перетаскивания
    draggedElement = elements.slice().reverse().find(el => hitTest(worldPos, el));
    if (draggedElement) {
      dragOffsetX = worldPos.x - draggedElement.x;
      dragOffsetY = worldPos.y - draggedElement.y;
    }
  } else if (currentMode === 'draw') {
    isDrawing = true;
    currentStroke = [{ x: worldPos.x, y: worldPos.y }];
  } else if (currentMode === 'eraser') {
    eraseAt(worldPos);
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (isPanning) {
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    render();
    return;
  }

  const worldPos = screenToWorld(e.clientX, e.clientY);

  if (draggedElement && currentMode === 'select') {
    draggedElement.x = worldPos.x - dragOffsetX;
    draggedElement.y = worldPos.y - dragOffsetY;
    render();
    return;
  }

  if (isDrawing && currentMode === 'draw') {
    currentStroke.push({ x: worldPos.x, y: worldPos.y });
    render();
  } else if (currentMode === 'eraser' && e.buttons === 1) {
    eraseAt(worldPos);
  }
});

canvas.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    document.body.style.cursor = isSpacePressed ? 'grab' : 'default';
  }
  draggedElement = null;

  if (isDrawing && currentMode === 'draw') {
    isDrawing = false;
    if (currentStroke.length > 0) {
      elements.push({ type: 'stroke', points: currentStroke, color: '#818cf8', width: 3 });
      currentStroke = [];
    }
    render();
  }
});

function screenToWorld(sx, sy) {
  return {
    x: (sx - panX) / scale,
    y: (sy - panY) / scale
  };
}

function hitTest(pos, el) {
  if (el.type === 'image') {
    return pos.x >= el.x && pos.x <= el.x + el.w && pos.y >= el.y && pos.y <= el.y + el.h;
  }
  if (el.type === 'shape' || el.type === 'chord') {
    return Math.hypot(el.x - pos.x, el.y - pos.y) < 50;
  }
  return false;
}

function eraseAt(pos) {
  const radius = 15 / scale;
  elements = elements.filter(el => {
    if (el.type === 'stroke') {
      return !el.points.some(pt => Math.hypot(pt.x - pos.x, pt.y - pos.y) <= radius);
    }
    return !hitTest(pos, el);
  });
  render();
}

// DRAG & DROP СКРИНШОТОВ
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const dropPos = screenToWorld(e.clientX, e.clientY);
        let w = img.width > 900 ? 900 : img.width;
        let h = (img.height * w) / img.width;
        elements.push({
          type: 'image',
          img: img,
          x: dropPos.x - w / 2,
          y: dropPos.y - h / 2,
          w: w,
          h: h
        });
        render();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(files[0]);
  }
});

function addVocalEffect(name) {
  const centerWorld = screenToWorld(width / 2, height / 2);
  elements.push({
    type: 'shape',
    text: name,
    x: centerWorld.x,
    y: centerWorld.y
  });
  render();
}

window.addChordPrompt = function() {
  const chordName = prompt("Введите аккорд (например, Am7, Cmaj7, G):", "Am");
  if (chordName) {
    const centerWorld = screenToWorld(width / 2, height / 2);
    elements.push({
      type: 'chord',
      text: chordName,
      x: centerWorld.x,
      y: centerWorld.y
    });
    render();
  }
};

function render() {
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  drawGrid();

  elements.forEach(el => {
    if (el.type === 'image') {
      ctx.drawImage(el.img, el.x, el.y, el.w, el.h);
    } else if (el.type === 'stroke') {
      ctx.beginPath();
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      el.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    } else if (el.type === 'shape') {
      ctx.save();
      ctx.translate(el.x, el.y);
      ctx.fillStyle = 'rgba(30, 30, 42, 0.9)';
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-10, -22, ctx.measureText(el.text).width + 20, 34, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px sans-serif';
      ctx.fillText(el.text, 0, 0);
      ctx.restore();
    } else if (el.type === 'chord') {
      ctx.save();
      ctx.translate(el.x, el.y);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(el.text, 0, 0);
      ctx.restore();
    }
  });

  if (isDrawing && currentStroke.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    currentStroke.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  }

  ctx.restore();
}

function drawGrid() {
  const gridSize = 60;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;

  const startX = Math.floor((-panX / scale) / gridSize) * gridSize;
  const endX = startX + (width / scale) + gridSize * 2;
  const startY = Math.floor((-panY / scale) / gridSize) * gridSize;
  const endY = startY + (height / scale) + gridSize * 2;

  for (let x = startX; x < endX; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
  }
  for (let y = startY; y < endY; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
  }
}

resizeCanvas();
