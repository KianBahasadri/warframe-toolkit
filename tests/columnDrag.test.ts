import test from 'node:test';
import assert from 'node:assert/strict';
import { projectColumnOrder } from '../src/lib/columnDrag.ts';

const columns = [
  { key: 'name', width: 360 }, { key: 'owned', width: 96 },
  { key: 'rank', width: 84 }, { key: 'mastered', width: 124 },
];
const original = columns.map(column => column.key);

test('wide columns cross small neighbors one at a time and reverse without oscillating at a boundary', () => {
  let order = projectColumnOrder(columns, original, 'name', 40);
  assert.deepEqual(order, original);
  order = projectColumnOrder(columns, order, 'name', 56);
  assert.deepEqual(order, ['owned', 'name', 'rank', 'mastered']);
  for (const left of [48, 51, 47, 49, 48, 50]) {
    order = projectColumnOrder(columns, order, 'name', left);
    assert.deepEqual(order, ['owned', 'name', 'rank', 'mastered']);
  }
  order = projectColumnOrder(columns, order, 'name', 250);
  assert.deepEqual(order, ['owned', 'rank', 'mastered', 'name']);
  order = projectColumnOrder(columns, order, 'name', 160);
  assert.deepEqual(order, ['owned', 'rank', 'name', 'mastered']);
  assert.deepEqual(projectColumnOrder(columns, order, 'name', 0), original);
  assert.deepEqual(original, ['name', 'owned', 'rank', 'mastered']);
});

test('narrow columns use the neighboring width when crossing a wide column', () => {
  let order = projectColumnOrder(columns, original, 'owned', 170);
  assert.deepEqual(order, ['owned', 'name', 'rank', 'mastered']);
  for (const left of [179, 181, 178, 182]) {
    order = projectColumnOrder(columns, order, 'owned', left);
    assert.deepEqual(order, ['owned', 'name', 'rank', 'mastered']);
  }
  assert.deepEqual(projectColumnOrder(columns, order, 'owned', 190), original);
});
