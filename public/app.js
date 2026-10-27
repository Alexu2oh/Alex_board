const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;

// Трансформация (Зум и Панорамирование как в Miro)
let scale = 1;
let panX = 0;
let panY = 0;

let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let isSpacePressed = false;

// Элементы доски (картинки, заготовки, штрихи)
let elements = [];
let currentMode = 'draw'; // 'draw' или 'erase'
let isDrawing = false;
let currentStroke = [];

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  render();
}

window.addEventListener('resize', resizeCanvas);

// Обработка клавиши Пробел для панорамирования
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

// Зум (Scale)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = 1.05;
  const mouseX = e.clientX;
  const mouseY = e.clientY;

  let newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
  newScale = Math.min(Math.max(0.2, newScale), 5); // ограничение зума

  // Масштабирование относительно курсора
  panX = mouseX - (mouseX - panX) * (newScale / scale);
  panY = mouseY - (mouseY - panY) * (newScale / scale);
  scale = newScale;

  render();
}, { passive: false });

// Мышь / Тач
canvas.addEventListener('mousedown', (e) => {
  if (isSpacePressed || e.button === 1) { // Пробел или средняя кнопка
    isPanning = true;
    startPanX = e.clientX - panX;
    startPanY = e.clientY - panY;
    document.body.style.cursor = 'grabbing';
    return;
  }

  if (currentMode === 'draw') {
    isDrawing = true;
    const worldPos = screenToWorld(e.clientX, e.clientY);
    currentStroke = [{ x: worldPos.x, y: worldPos.y }];
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (isPanning) {
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    render();
    return;
  }

  if (isDrawing) {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    currentStroke.push({ x: worldPos.x, y: worldPos.y });
    render();
  }
});

canvas.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    document.body.style.cursor = isSpacePressed ? 'grab' : 'default';
  }

  if (isDrawing) {
    isDrawing = false;
    if (currentStroke.length > 0) {
      elements.push({ type: 'stroke', points: currentStroke, color: '#ff4757', width: 3 });
      currentStroke = [];
    }
    render();
  }
});

// Перевод координат экрана в координаты мира доски
function screenToWorld(sx, sy) {
  return {
    x: (sx - panX) / scale,
    y: (sy - panY) / scale
  };
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
        elements.push({
          type: 'image',
          img: img,
          x: dropPos.x - img.width / 4,
          y: dropPos.y - img.height / 4,
          w: img.width / 2,
          h: img.height / 2
        });
        render();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(files[0]);
  }
});

// Добавление заготовок (вокальная графика)
window.addShape = function(shapeType) {
  const centerWorld = screenToWorld(width / 2, height / 2);
  elements.push({
    type: 'shape',
    shape: shapeType,
    x: centerWorld.x,
    y: centerWorld.y
  });
  render();
};

// Отрисовка
function render() {
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  // Сетка доски
  drawGrid();

  // Отрисовка элементов
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
      drawVocalShape(el);
    }
  });

  // Рисование текущей линии
  if (isDrawing && currentStroke.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = '#ff4757';
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

// Отрисовка фоновой сетки
function drawGrid() {
  const gridSize = 40;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  const startX = Math.floor((-panX / scale) / gridSize) * gridSize;
  const endX = startX + (width / scale) + gridSize * 2;
  const startY = Math.floor((-panY / scale) / gridSize) * gridSize;
  const endY = startY + (height / scale) + gridSize * 2;

  for (let x = startX; x < endX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }
  for (let y = startY; y < endY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }
}

// Отрисовка вокальных заготовок
function drawVocalShape(el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.font = 'bold 28px sans-serif';

  if (el.shape === 'vibrato') {
    ctx.beginPath();
    for (let x = 0; x < 100; x += 10) {
      ctx.lineTo(x, Math.sin(x * 0.2) * 12);
    }
    ctx.stroke();
  } else if (el.shape === 'glissando') {
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(80, -20);
    ctx.stroke();
    // Стрелочка
    ctx.lineTo(70, -20);
    ctx.moveTo(80, -20);
    ctx.lineTo(80, -10);
    ctx.stroke();
  } else if (el.shape === 'piano') {
    ctx.fillText('p', 0, 0);
  } else if (el.shape === 'forte') {
    ctx.fillText('f', 0, 0);
  } else if (el.shape === 'accent') {
    ctx.fillText('❯', 0, 0);
  }

  ctx.restore();
}

resizeCanvas();
