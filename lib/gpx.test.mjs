// lib/gpx.ts 단위 테스트.
//
// 실행: node --experimental-strip-types --test lib/gpx.test.mjs
// 파서가 DOMParser 없이 정규식으로 동작하므로 node 에서 스텁 없이 그대로 돈다.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_POINTS,
  TrackParseError,
  USER_TRACK_COURSE_ID,
  formatDuration,
  parseTrackFile,
  toCourseFeature,
  toWaypointCollection,
  trackBounds,
} from './gpx.ts';
import { buildProfile } from './elevation.ts';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>메타 이름</name></metadata>
  <wpt lat="37.7" lon="127.1"><ele>500</ele><name>약수터 &amp; 쉼터</name></wpt>
  <trk>
    <name><![CDATA[북한산 &amp; 백운대]]></name>
    <trkseg>
      <trkpt lat="37.6" lon="127.0"><ele>100</ele><time>2026-08-01T00:00:00Z</time></trkpt>
      <trkpt lat="37.61" lon="127.0"><ele>101</ele><time>2026-08-01T00:10:00Z</time></trkpt>
      <trkpt lat="37.62" lon="127.0"><ele>200</ele><time>2026-08-01T00:20:00Z</time></trkpt>
      <trkpt lat="999" lon="127.0"><ele>999</ele></trkpt>
      <trkpt lat="37.63" lon="127.0"><ele>150</ele><time>2026-08-01T01:30:00Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="37.70" lon="127.0"/>
      <trkpt lat="37.71" lon="127.0"/>
    </trkseg>
  </trk>
</gpx>`;

test('GPX: trk/trkseg/trkpt 를 세그먼트별로 읽고 깨진 좌표는 건너뛴다', () => {
  const track = parseTrackFile(GPX, 'hike.gpx');
  assert.equal(track.format, 'gpx');
  assert.equal(track.name, '북한산 & 백운대');
  assert.equal(track.segments.length, 2);
  assert.equal(track.segments[0].length, 4); // lat=999 는 버림
  assert.deepEqual(track.segments[0][0], [127.0, 37.6, 100]);
  assert.deepEqual(track.segments[1][0], [127.0, 37.7]); // 고도 없으면 2요소
  assert.equal(track.points.length, 6);
  assert.equal(track.sampled, false);
});

test('GPX: 통계 — 거리·상승/하강(3m 임계)·최고/최저·소요시간·시작/끝', () => {
  const { stats } = parseTrackFile(GPX, 'hike.gpx');
  // 위도 0.01° ≈ 1.11km. 세그먼트1 은 0.03°, 세그먼트2 는 0.01°. 사이 간격은 더하지 않는다.
  assert.ok(stats.distanceKm > 4.4 && stats.distanceKm < 4.5, `distance ${stats.distanceKm}`);
  // 100→101 은 1m 라 무시, 100→200 +100, 200→150 -50.
  assert.equal(stats.gainM, 100);
  assert.equal(stats.lossM, 50);
  assert.equal(stats.maxM, 200);
  assert.equal(stats.minM, 100);
  assert.equal(stats.durationSec, 90 * 60);
  assert.deepEqual(stats.start, [127.0, 37.6]);
  assert.deepEqual(stats.end, [127.0, 37.71]);
});

test('GPX: wpt 는 웨이포인트로, 엔티티는 풀어서', () => {
  const track = parseTrackFile(GPX, 'hike.gpx');
  assert.deepEqual(track.waypoints, [{ lon: 127.1, lat: 37.7, ele: 500, name: '약수터 & 쉼터' }]);
  const fc = toWaypointCollection(track);
  assert.equal(fc.features[0].properties.name, '약수터 & 쉼터');
});

test('GPX: rte/rtept 만 있어도 세그먼트 하나로 읽고 고도 없으면 통계는 null', () => {
  const xml = `<gpx><rte><name>계획 경로</name>
    <rtept lat="36.0" lon="128.0"/><rtept lat="36.01" lon="128.0"/></rte></gpx>`;
  const track = parseTrackFile(xml, 'route.gpx');
  assert.equal(track.name, '계획 경로');
  assert.equal(track.segments.length, 1);
  assert.equal(track.stats.gainM, null);
  assert.equal(track.stats.maxM, null);
  assert.equal(track.stats.durationSec, null);
});

test('GPX: 이름이 없으면 파일명에서', () => {
  const xml = `<gpx><trk><trkseg>
    <trkpt lat="36.0" lon="128.0"/><trkpt lat="36.01" lon="128.0"/></trkseg></trk></gpx>`;
  assert.equal(parseTrackFile(xml, '2026-08-01 지리산.gpx').name, '2026-08-01 지리산');
});

test('KML: LineString coordinates 와 Placemark/Point 웨이포인트', () => {
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <name>문서명</name>
    <Placemark><name>정상</name><Point><coordinates>127.5,36.5,700</coordinates></Point></Placemark>
    <Placemark><name>코스</name><LineString><coordinates>
      127.0,36.0,100 127.0,36.01,150
      127.0,36.02,120
    </coordinates></LineString></Placemark>
  </Document></kml>`;
  const track = parseTrackFile(kml, 'trip.kml');
  assert.equal(track.format, 'kml');
  assert.equal(track.name, '코스');
  assert.equal(track.segments.length, 1);
  assert.equal(track.segments[0].length, 3);
  assert.equal(track.stats.gainM, 50);
  assert.equal(track.stats.lossM, 30);
  assert.deepEqual(track.waypoints, [{ lon: 127.5, lat: 36.5, ele: 700, name: '정상' }]);
});

test('KML: gx:Track 은 when 과 gx:coord 를 짝지어 시각을 읽는다', () => {
  const kml = `<kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Placemark><gx:Track>
    <when>2026-08-01T00:00:00Z</when><when>2026-08-01T02:00:00Z</when>
    <gx:coord>127.0 36.0 100</gx:coord><gx:coord>127.0 36.02 300</gx:coord>
  </gx:Track></Placemark></kml>`;
  const track = parseTrackFile(kml, 'trip.kml');
  assert.equal(track.points.length, 2);
  assert.equal(track.stats.durationSec, 7200);
  assert.equal(track.stats.gainM, 200);
});

test('오류: 빈 파일 · 지원하지 않는 형식 · 좌표 없음 · 크기 초과', () => {
  assert.throws(() => parseTrackFile('', 'a.gpx'), TrackParseError);
  assert.throws(() => parseTrackFile('   \n', 'a.gpx'), /비어/);
  assert.throws(() => parseTrackFile('{"json":true}', 'a.json'), /GPX 또는 KML/);
  assert.throws(() => parseTrackFile('not xml', 'a.gpx'), /GPX 파일로 보이지/);
  assert.throws(() => parseTrackFile('<gpx><wpt lat="1" lon="1"/></gpx>', 'a.gpx'), /트랙 좌표/);
  assert.throws(() => parseTrackFile('<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>', 'a.gpx'), /트랙 좌표/);
  const huge = `<gpx>${' '.repeat(5 * 1024 * 1024 + 1)}</gpx>`;
  assert.throws(() => parseTrackFile(huge, 'a.gpx'), /너무 큽니다/);
});

test('점 수 상한을 넘으면 균등 샘플링하고 첫·끝 점은 남긴다', () => {
  const count = MAX_POINTS + 2_000;
  const pts = Array.from({ length: count }, (_, i) =>
    `<trkpt lat="${(36 + i * 0.00001).toFixed(6)}" lon="127"/>`,
  ).join('');
  const track = parseTrackFile(`<gpx><trk><trkseg>${pts}</trkseg></trk></gpx>`, 'big.gpx');
  assert.equal(track.sampled, true);
  assert.ok(track.points.length <= MAX_POINTS);
  assert.deepEqual(track.stats.start, [127, 36]);
  assert.equal(track.stats.end[1], Number((36 + (count - 1) * 0.00001).toFixed(6)));
});

test('toCourseFeature 는 기존 코스 properties 키를 채우고 buildProfile 과 호환된다', () => {
  const track = parseTrackFile(GPX, 'hike.gpx');
  const feature = toCourseFeature(track);
  assert.equal(feature.geometry.type, 'MultiLineString'); // 세그먼트 2개
  assert.equal(feature.properties['코스ID'], USER_TRACK_COURSE_ID);
  assert.equal(feature.properties['그룹'], '북한산 & 백운대');
  assert.equal(feature.properties['거리_km'], track.stats.distanceKm);
  assert.equal(feature.properties['누적상승_m'], 100);
  assert.equal(feature.properties['최고고도_m'], 200);
  assert.equal(feature.properties['최저고도_m'], 100);

  const profile = buildProfile(feature.geometry);
  assert.ok(profile);
  assert.equal(profile.gainM, 100);
  assert.equal(profile.lossM, 50);
  // 세그먼트 2 는 고도가 없어 프로파일 조각에서 빠진다.
  assert.equal(profile.segments.length, 1);
});

test('toCourseFeature: 고도 없는 트랙은 최고·최저 0 (미상 신호) 이고 단일 세그먼트는 LineString', () => {
  const xml = `<gpx><trk><trkseg><trkpt lat="36" lon="128"/><trkpt lat="36.01" lon="128"/></trkseg></trk></gpx>`;
  const feature = toCourseFeature(parseTrackFile(xml, 'flat.gpx'));
  assert.equal(feature.geometry.type, 'LineString');
  assert.equal(feature.properties['최고고도_m'], 0);
  assert.equal(feature.properties['최저고도_m'], 0);
  assert.equal(buildProfile(feature.geometry), null);
});

test('trackBounds 는 웨이포인트까지 감싼다', () => {
  const track = parseTrackFile(GPX, 'hike.gpx');
  assert.deepEqual(trackBounds(track), [127.0, 37.6, 127.1, 37.71]);
});

test('formatDuration', () => {
  assert.equal(formatDuration(45 * 60), '45분');
  assert.equal(formatDuration(3600), '1시간');
  assert.equal(formatDuration(2 * 3600 + 15 * 60), '2시간 15분');
});
