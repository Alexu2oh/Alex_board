export function touchesStroke(strokePoints, p1, p2, radius = 5) {
  for (let pt of strokePoints) {
    if (Math.hypot(pt.x - p1.x, pt.y - p1.y) <= radius) return true;
  }
  return false;
}

export function pitchForStaffY(y) {
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
  scale += (dx + dy) / 300;
  scale = Math.max(0.3, Math.min(scale, 4));
  return { ...obj, scale };
}
