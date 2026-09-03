// lib/poi-category.ts 단위 테스트.
//
// 실행: node --experimental-strip-types --test lib/poi-category.test.mjs
// (vitest 등 프레임워크 없이 node 내장 test runner 만 쓴다.)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_VISIBLE_CATEGORIES,
  POI_CATEGORIES,
  POI_CATEGORY_META,
  categorizePoi,
  formatCourseSummary,
  summarizeCourse,
  withPoiCategories,
} from './poi-category.ts';

test('메타: 기본 표시는 7개, order 는 유일, 색은 선택 파랑·고도 램프와 겹치지 않는다', () => {
  assert.deepEqual(
    [...DEFAULT_VISIBLE_CATEGORIES],
    ['toilet', 'parking', 'shelter', 'water', 'viewpoint', 'danger', 'refuge'],
  );
  const orders = POI_CATEGORIES.map((c) => POI_CATEGORY_META[c].order);
  assert.equal(new Set(orders).size, orders.length);
  const reserved = ['#3182f6', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#f43f5e', '#60a5fa'];
  for (const c of POI_CATEGORIES) {
    assert.ok(!reserved.includes(POI_CATEGORY_META[c].color.toLowerCase()), c);
  }
});

test('시설 키워드', () => {
  assert.equal(categorizePoi('북한산성유료주차장'), 'parking');
  assert.equal(categorizePoi('연주암 화장실'), 'toilet');
  assert.equal(categorizePoi('해우소'), 'toilet');
  assert.equal(categorizePoi('구룡암 약수터'), 'water');
  assert.equal(categorizePoi('샘터(먹는물)'), 'water');
  assert.equal(categorizePoi('대피소내 식수대'), 'refuge');
  assert.equal(categorizePoi('향적봉대피소'), 'refuge');
  assert.equal(categorizePoi('국가지점번호 다사 1234 5678'), 'emergency');
});

test('위험이 최우선', () => {
  assert.equal(categorizePoi('출입금지 안내'), 'danger');
  assert.equal(categorizePoi('낙석주의 구간'), 'danger');
  assert.equal(categorizePoi('입산통제소'), 'danger');
  assert.equal(categorizePoi('위험한 암릉길'), 'danger');
  assert.equal(categorizePoi('추락위험'), 'danger');
});

test('조망 > 정상, 정상 > 쉼터, 봉은 단어 끝일 때만', () => {
  assert.equal(categorizePoi('쌀개봉 조망점'), 'viewpoint');
  assert.equal(categorizePoi('전망대'), 'viewpoint');
  assert.equal(categorizePoi('칠불봉'), 'peak');
  assert.equal(categorizePoi('가야산 우두봉(상왕봉)'), 'peak');
  assert.equal(categorizePoi('북한산 정상'), 'peak');
  assert.equal(categorizePoi('삼불봉고개 쉼터'), 'shelter');
  assert.equal(categorizePoi('봉암사갈림길'), 'junction');
});

test('사찰은 2~4글자 사/암 끝만, 오탐 제외', () => {
  assert.equal(categorizePoi('석남사'), 'temple');
  assert.equal(categorizePoi('보리암'), 'temple');
  assert.equal(categorizePoi('탑사'), 'temple');
  assert.equal(categorizePoi('사거리'), 'other');
  assert.equal(categorizePoi('사기막골'), 'other');
  assert.equal(categorizePoi('기암'), 'other');
  assert.equal(categorizePoi('독사'), 'other');
  assert.equal(categorizePoi('정상 급경사'), 'peak');
  assert.equal(categorizePoi('입암산성의 역사'), 'other');
  assert.equal(categorizePoi('암릉구간'), 'other');
});

test('폭포·계곡, 갈림길, 이정표, 기타', () => {
  assert.equal(categorizePoi('구천동 폭포'), 'waterfall');
  assert.equal(categorizePoi('용소계곡'), 'waterfall');
  assert.equal(categorizePoi('갈림길'), 'junction');
  assert.equal(categorizePoi('이정표'), 'signpost');
  assert.equal(categorizePoi('위치표지판'), 'signpost');
  assert.equal(categorizePoi('웨이포인트 3'), 'signpost');
  assert.equal(categorizePoi('안내소'), 'signpost');
  assert.equal(categorizePoi('헬기장'), 'other');
  assert.equal(categorizePoi(''), 'other');
  assert.equal(categorizePoi(undefined), 'other');
  assert.equal(categorizePoi(42), 'other');
});

const pois = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: null, properties: { 코스ID: 'A_1', 이름: '화장실' } },
    { type: 'Feature', geometry: null, properties: { 코스ID: 'A_1', 이름: '중간 쉼터' } },
    { type: 'Feature', geometry: null, properties: { 코스ID: 'A_1', 이름: '약수터' } },
    { type: 'Feature', geometry: null, properties: { 코스ID: 'A_1', 이름: '낙석주의' } },
    { type: 'Feature', geometry: null, properties: { 코스ID: 'A_2', 이름: '전망대' } },
    { type: 'Feature', geometry: null, properties: { 코스ID: 'A_2', 이름: '갈림길' } },
  ],
};

test('withPoiCategories 는 원본을 두고 새 객체에 category 를 붙인다', () => {
  const out = withPoiCategories(pois);
  assert.notEqual(out, pois);
  assert.notEqual(out.features[0], pois.features[0]);
  assert.equal(pois.features[0].properties.category, undefined);
  assert.equal(out.features[0].properties.category, 'toilet');
  assert.equal(out.features[0].properties['코스ID'], 'A_1');
  assert.equal(out.features[5].properties.category, 'junction');
});

test('summarizeCourse 는 코스ID 로 골라 센다 (category 유무 무관)', () => {
  assert.deepEqual(summarizeCourse(pois, 'A_1'), {
    toilet: 1, shelter: 1, viewpoint: 0, water: 1, danger: 1,
  });
  assert.deepEqual(summarizeCourse(withPoiCategories(pois), 'A_2'), {
    toilet: 0, shelter: 0, viewpoint: 1, water: 0, danger: 0,
  });
  assert.deepEqual(summarizeCourse(pois, 'none'), {
    toilet: 0, shelter: 0, viewpoint: 0, water: 0, danger: 0,
  });
});

test('formatCourseSummary 는 0 을 빼고, 전부 0 이면 null', () => {
  assert.equal(
    formatCourseSummary({ toilet: 2, shelter: 3, viewpoint: 1, water: 1, danger: 1 }),
    '🚻 2 · 쉼터 3 · 조망 1 · 💧 1 · ⚠ 1',
  );
  assert.equal(formatCourseSummary({ toilet: 0, shelter: 1, viewpoint: 0, water: 0, danger: 0 }), '쉼터 1');
  assert.equal(formatCourseSummary({ toilet: 0, shelter: 0, viewpoint: 0, water: 0, danger: 0 }), null);
});
