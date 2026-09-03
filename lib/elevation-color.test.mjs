// lib/elevation-color.ts 단위 테스트.
//
// 실행: node --experimental-strip-types --test lib/elevation-color.test.mjs
// (vitest 등 프레임워크 없이 node 내장 test runner 만 쓴다.)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ELEVATION_BINS,
  UNKNOWN_ELEVATION_COLOR,
  elevationColorFor,
  elevationStepExpression,
} from './elevation-color.ts';

const color = (i) => ELEVATION_BINS[i].color;

test('bins 은 오름차순이고 첫 구간은 0 부터', () => {
  assert.equal(ELEVATION_BINS[0].fromM, 0);
  for (let i = 1; i < ELEVATION_BINS.length; i += 1) {
    assert.ok(ELEVATION_BINS[i].fromM > ELEVATION_BINS[i - 1].fromM);
  }
  assert.equal(new Set(ELEVATION_BINS.map((b) => b.color)).size, ELEVATION_BINS.length);
});

test('미상(null/undefined/0/NaN/음수) 은 슬레이트', () => {
  assert.equal(elevationColorFor(null), UNKNOWN_ELEVATION_COLOR);
  assert.equal(elevationColorFor(undefined), UNKNOWN_ELEVATION_COLOR);
  assert.equal(elevationColorFor(0), UNKNOWN_ELEVATION_COLOR);
  assert.equal(elevationColorFor(Number.NaN), UNKNOWN_ELEVATION_COLOR);
  assert.equal(elevationColorFor(-5), UNKNOWN_ELEVATION_COLOR);
  assert.ok(!ELEVATION_BINS.some((b) => b.color === UNKNOWN_ELEVATION_COLOR));
});

test('경계값: 하한은 포함, 하한 직전은 이전 구간', () => {
  assert.equal(elevationColorFor(1), color(0));
  assert.equal(elevationColorFor(299.9), color(0));
  assert.equal(elevationColorFor(300), color(1));
  assert.equal(elevationColorFor(599.9), color(1));
  assert.equal(elevationColorFor(600), color(2));
  assert.equal(elevationColorFor(999.9), color(2));
  assert.equal(elevationColorFor(1000), color(3));
  assert.equal(elevationColorFor(1499.9), color(3));
  assert.equal(elevationColorFor(1500), color(4));
  assert.equal(elevationColorFor(1947), color(4)); // 한라산
  assert.equal(elevationColorFor(10_000), color(4));
});

test('step 표현식은 bins 와 같은 스톱을 갖고 미상을 먼저 거른다', () => {
  const expr = elevationStepExpression('elevation');
  assert.equal(expr[0], 'case');
  assert.equal(expr[2], UNKNOWN_ELEVATION_COLOR);
  const step = expr[3];
  assert.deepEqual(step.slice(0, 3), ['step', ['get', 'elevation'], color(0)]);
  const stops = step.slice(3);
  assert.deepEqual(
    stops,
    ELEVATION_BINS.slice(1).flatMap((b) => [b.fromM, b.color]),
  );
});
