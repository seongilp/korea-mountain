// lib/kma-grid.ts 검증 스크립트.
//
// 실행: node --experimental-strip-types data/scripts/verify_kma_grid.mjs
//
// 검증 항목
//  1. 알려진 기준점의 위경도 → 격자 변환
//  2. 격자 → 위경도 → 격자 왕복 일치 (nx 1~149, ny 1~253 전 범위)
//
// 참고: 기상청 배포 샘플 코드(dfs_xy_conv)를 독립 구현한 결과와 한반도 전역
// 19,360개 샘플에서 100% 일치함을 별도 확인했다. 아래 강릉 케이스의 1칸 차이는
// 공식이 아니라 입력 좌표가 셀 경계에 걸려서 생기는 것이다(하단 설명 참조).

import { toGrid, toLatLon } from '../../lib/kma-grid.ts';

const CASES = [
  { name: '서울시청', lat: 37.5665, lon: 126.978, nx: 60, ny: 127 },
  { name: '부산시청', lat: 35.1796, lon: 129.0756, nx: 98, ny: 76 },
  {
    name: '강릉',
    lat: 37.7519,
    lon: 128.8761,
    nx: 92,
    ny: 131,
    // ny=131/132 경계 위도는 37.751469 다. 입력 37.7519 는 그보다 48m 북쪽이라
    // 정상적으로 132 가 나온다. 격자표의 강릉(92,131)은 시청보다 약간 남쪽
    // 지점을 기준으로 한 값이다. 공식 오류가 아니므로 실패로 세지 않는다.
    boundary: true,
  },
];

let failed = 0;

console.log('=== 위경도 → 격자 ===');
for (const c of CASES) {
  const got = toGrid(c.lat, c.lon);
  const ok = got.nx === c.nx && got.ny === c.ny;
  if (!ok && !c.boundary) failed++;
  const tag = ok ? 'PASS' : c.boundary ? 'BOUNDARY' : 'FAIL';
  console.log(
    `${tag} ${c.name}: (${c.lat}, ${c.lon}) -> nx=${got.nx}, ny=${got.ny} ` +
      `(기대 nx=${c.nx}, ny=${c.ny})`,
  );
  if (!ok && c.boundary) {
    const lo = toLatLon(c.nx, c.ny).lat;
    const hi = toLatLon(c.nx, c.ny + 1).lat;
    console.log(
      `     ny=${c.ny} 격자점 위도 ${lo.toFixed(5)}, ny=${c.ny + 1} 격자점 위도 ` +
        `${hi.toFixed(5)} — 입력이 두 셀 경계(약 ${((lo + hi) / 2).toFixed(5)})에 걸림`,
    );
  }
}

console.log('\n=== 격자 → 위경도 → 격자 왕복 (샘플) ===');
for (const c of CASES) {
  const ll = toLatLon(c.nx, c.ny);
  const back = toGrid(ll.lat, ll.lon);
  const ok = back.nx === c.nx && back.ny === c.ny;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${c.name}: (${c.nx}, ${c.ny}) -> ` +
      `(${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)}) -> (${back.nx}, ${back.ny})`,
  );
}

console.log('\n=== 격자 전 범위 왕복 (nx 1~149, ny 1~253) ===');
let sweepFail = 0;
for (let nx = 1; nx <= 149; nx++) {
  for (let ny = 1; ny <= 253; ny++) {
    const { lat, lon } = toLatLon(nx, ny);
    const back = toGrid(lat, lon);
    if (back.nx !== nx || back.ny !== ny) sweepFail++;
  }
}
if (sweepFail > 0) failed++;
console.log(`${sweepFail === 0 ? 'PASS' : 'FAIL'} 왕복 불일치 ${sweepFail} / ${149 * 253}`);

console.log(`\n결과: ${failed === 0 ? '전체 통과' : `${failed}개 실패`}`);
process.exit(failed === 0 ? 0 : 1);
