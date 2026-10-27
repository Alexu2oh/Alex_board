const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;

// Зум и панорамирование (Miro-стиль)
let scale = 1;
let panX = 0;
let panY = 0;

let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let isSpacePressed = false;

// Состояние доски
let elements = [];
let currentMode = 'draw'; // 'draw' или 'eraser'
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

function setMode(mode) {
  currentMode = mode;
  document.getElementById('btn-draw').classList.toggle('active', mode === 'draw');
  document.getElementById('btn-eraser').classList.toggle('active', mode === 'eraser');
}

function clearBoard() {
  if (confirm('Очистить всю доску?')) {
    elements = [];
    render();
  }
}

// Управление пробелом для перемещения
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

// Плавный зум колесиком мыши
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

// События мыши / рисования / ластика
canvas.addEventListener('mousedown', (e) => {
  if (isSpacePressed || e.button === 1) {
    isPanning = true;
    startPanX = e.clientX - panX;
    startPanY = e.clientY - panY;
    document.body.style.cursor = 'grabbing';
    return;
  }

  const worldPos = screenToWorld(e.clientX, e.clientY);

  if (currentMode === 'draw') {
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

  if (isDrawing && currentMode === 'draw') {
    isDrawing = false;
    if (currentStroke.length > 0) {
      elements.push({ type: 'stroke', points: currentStroke, color: '#6366f1', width: 4 });
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

// Логика ластика
function eraseAt(pos) {
  const radius = 15 / scale;
  elements = elements.filter(el => {
    if (el.type === 'stroke') {
      // Проверяем пересечение с точками штриха
      let hits = el.points.some(pt => Math.hypot(pt.x - pos.x, pt.y - pos.y) <= radius);
      return !hits;
    }
    // Картинки и заготовки удаляем по клику/стиранию в их области
    if (el.type === 'image') {
      return !(pos.x >= el.x && pos.x <= el.x + el.w && pos.y >= el.y && pos.y <= el.y + el.h);
    }
    if (el.type === 'shape') {
      return !(Math.hypot(el.x - pos.x, el.y - pos.y) < 30);
    }
    return true;
  });
  render();
}

// DRAG & DROP СКРИНШОТОВ (перетаскивание картинок)
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
        // Ограничим начальный размер картинки для удобства
        let w = img.width > 800 ? 800 : img.width;
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

// Добавление музыкальных/вокальных заготовок
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

// Главная функция рендеринга
function render() {
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  drawGrid();

  // Отрисовка всех элементов доски
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

  // Штрих в процессе рисования
  if (isDrawing && currentStroke.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    currentStroke.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  }

  ctx.restore();
}

// Сетка фона доски
function drawGrid() {
  const gridSize = 50;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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

// Отрисовка вокальных графических значков
function drawVocalShape(el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.font = 'bold 32px sans-serif';

  if (el.shape === 'vibrato') {
    ctx.beginPath();
    for (let x = 0; x < 120; x += 12) {
      ctx.lineTo(x, Math.sin(x * 0.2) * 14);
    }
    ctx.stroke();
  } else if (el.shape === 'glissando') {
    ctx.beginPath();
    ctx.moveTo(0, 25);
    ctx.lineTo(90, -25);
    ctx.stroke();
    ctx.lineTo(75, -25);
    ctx.moveTo(90, -25);
    ctx.lineTo(90, -10);
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
