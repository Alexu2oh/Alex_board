import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchesStroke } from '../public/resize.js';

test('eraser detects crossing and nearby pencil lines, but ignores distant lines', () => {
  const line = [[0, 0], [100, 0]];
  assert.equal(touchesStroke(line, {x:50,y:-20}, {x:50,y:20}, 5), true);
  assert.equal(touchesStroke(line, {x:30,y:4}, {x:40,y:4}, 5), true);
  assert.equal(touchesStroke(line, {x:30,y:10}, {x:40,y:10}, 5), false);
  assert.equal(touchesStroke([[20,20]], {x:20,y:21}, {x:20,y:21}, 5), true);
});

