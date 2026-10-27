import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resizeObject } from '../public/resize.js';

test('resizing from the right edge respects board zoom', () => {
  const result=resizeObject({x:10,y:20,scale:1},'e',200,100,100,0,2);
  assert.equal(result.scale,1.25);
  assert.deepEqual([result.x,result.y],[10,20]);
});
test('resizing from the left keeps the opposite edge fixed and limits minimum size', () => {
  const result=resizeObject({x:10,y:20,scale:1},'w',200,100,1000,0,1);
  assert.equal(result.scale,.25);
  assert.equal(result.x,160);
});
test('resizing from the top left keeps the opposite corner fixed', () => {
  const result=resizeObject({x:10,y:20,scale:1},'nw',200,100,-100,-50,1);
  assert.equal(result.scale,1.5);
  assert.deepEqual([result.x,result.y],[-90,-30]);
});
