import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pitchForStaffY, transposeChord } from '../public/resize.js';

test('staff positions map to treble clef pitches', () => {
  assert.equal(pitchForStaffY(24), 77);
  assert.equal(pitchForStaffY(64), 64);
  assert.equal(pitchForStaffY(74), 60);
  assert.equal(pitchForStaffY(80), null);
});

test('transposition preserves chord quality and accepts flats', () => {
  assert.equal(transposeChord('Am7', 2), 'Bm7');
  assert.equal(transposeChord('Bbmaj7', 2), 'Cmaj7');
  assert.equal(transposeChord('C/E', -1), 'B/D#');
  assert.equal(transposeChord('неизвестный', 1), null);
});
