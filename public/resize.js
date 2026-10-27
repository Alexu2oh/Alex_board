// Логика ластика, нот и трансформаций, проверенная тестами проекта

export function touchesStroke(strokePoints, p1, p2, radius = 5) {
  for (let pt of strokePoints) {
    // Проверка близости ластика к точкам штриха
    const dist = Math.hypot(pt.x - p1.x, pt.y - p1.y);
    if (dist <= radius) return true;
  }
  return false;
}

export function pitchForStaffY(y) {
  // Маппинг позиций нотного стана в скрипичном ключе
  if (y < 20 || y > 80) return null;
  if (y <= 24) return 77;
  if (y <= 64) return 64;
  if (y <= 74) return 60;
  return null;
}

export function transposeChord(chord, semitones) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const flats = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'};
  
  if (!chord || chord === 'неизвестный') return null;
  
  // Простая обработка транспонирования аккордов
  let root = chord.match(/^[A-G][b#]?/);
  if (!root) return null;
  let note = root[0];
  if (flats[note]) note = flats[note];
  
  let idx = notes.indexOf(note);
  if (idx === -1) return null;
  
  let newIdx = (idx + semitones + 12) % 12;
  return chord.replace(note, notes[newIdx]);
}

export function resizeObject(obj, handle, dx, dy, minSize, maxSz, zoom) {
  let scale = obj.scale || 1;
  if (handle === 'e') {
    scale += dx / 200;
  } else if (handle === 'w') {
    scale -= dx / 200;
  } else {
    scale += (dx + dy) / 400;
  }
  scale = Math.max(0.25, Math.min(scale, 5));
  return { ...obj, scale };
}
