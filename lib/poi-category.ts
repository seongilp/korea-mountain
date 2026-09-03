/**
 * 코스 POI 를 이름 키워드로 분류한다. 지도 점 색·필터 칩·코스 카드 요약이 전부 이 표 하나를 본다.
 *
 * 원본(`public/data/courses/<산>.json` 의 `pois`)에는 `종류` 필드가 있지만 값이 POI 마다
 * 유일한 코드(`0000000023` …)라 카테고리로 못 쓴다. 쓸 수 있는 건 `이름` 뿐이다.
 *
 * 전체 22,989건을 정규식으로 훑은 분포(대략):
 *   갈림길 5,573 · 쉼터 2,574 · 조망 1,394 · 사찰 1,132 · 이정표 1,111 · 정상/봉 835
 *   화장실 665 · 주차장 548 · 위험 454 · 폭포/계곡 414 · 국가지점번호 351 · 웨이포인트 306
 *   식수 233 · 대피소 24 · 기타 7,375
 * 갈림길·이정표·기타가 절반을 넘으므로 기본 표시에서는 빼고, 산행 중 실제로 찾게 되는
 * 화장실·주차장·쉼터·식수·조망·위험·대피소만 켠다. 북한산은 POI 가 1,768개라 전부 그리면 노이즈다.
 */

export type PoiCategory =
  | 'toilet'
  | 'parking'
  | 'shelter'
  | 'water'
  | 'viewpoint'
  | 'danger'
  | 'refuge'
  | 'junction'
  | 'peak'
  | 'temple'
  | 'waterfall'
  | 'emergency'
  | 'signpost'
  | 'other';

export interface PoiCategoryMeta {
  label: string;
  /** `#rrggbb`. 다크 베이스맵에서 읽히고 선택 파랑(#3182f6)·고도 램프와 안 겹치는 색. */
  color: string;
  /** 산을 고르면 바로 켜지는 카테고리. */
  defaultVisible: boolean;
  /** 칩·범례 정렬 순서. 작을수록 앞. */
  order: number;
}

/**
 * 카테고리별 표시 정보.
 *
 * 파랑 계열(#60a5fa 등)은 선택 강조와 헷갈려 쓰지 않는다. 주차장은 그래서 보라(#c084fc).
 * 고도 램프(#34d399 #a3e635 #fbbf24 #fb923c #f43f5e)와도 거리를 둔다 — 쉼터의 #fde68a 는
 * 램프의 #fbbf24 보다 훨씬 옅어 점 크기(2~5px)에서도 구분된다.
 */
export const POI_CATEGORY_META: Record<PoiCategory, PoiCategoryMeta> = {
  toilet: { label: '화장실', color: '#e2e8f0', defaultVisible: true, order: 0 }, // slate-200
  parking: { label: '주차장', color: '#c084fc', defaultVisible: true, order: 1 }, // purple-400
  shelter: { label: '쉼터', color: '#fde68a', defaultVisible: true, order: 2 }, // amber-200
  water: { label: '식수', color: '#67e8f9', defaultVisible: true, order: 3 }, // cyan-300
  viewpoint: { label: '조망', color: '#f9a8d4', defaultVisible: true, order: 4 }, // pink-300
  danger: { label: '위험', color: '#ef4444', defaultVisible: true, order: 5 }, // red-500
  refuge: { label: '대피소', color: '#fb7185', defaultVisible: true, order: 6 }, // rose-400
  peak: { label: '정상·봉', color: '#d9f99d', defaultVisible: false, order: 7 }, // lime-200
  temple: { label: '사찰', color: '#fdba74', defaultVisible: false, order: 8 }, // orange-300
  waterfall: { label: '폭포·계곡', color: '#99f6e4', defaultVisible: false, order: 9 }, // teal-200
  emergency: { label: '국가지점번호', color: '#facc15', defaultVisible: false, order: 10 }, // yellow-400
  junction: { label: '갈림길', color: '#64748b', defaultVisible: false, order: 11 }, // slate-500
  signpost: { label: '이정표', color: '#64748b', defaultVisible: false, order: 12 },
  other: { label: '기타', color: '#64748b', defaultVisible: false, order: 13 },
};

/** `order` 순으로 정렬한 카테고리 목록. 칩·범례가 쓴다. */
export const POI_CATEGORIES: readonly PoiCategory[] = (
  Object.keys(POI_CATEGORY_META) as PoiCategory[]
).sort((a, b) => POI_CATEGORY_META[a].order - POI_CATEGORY_META[b].order);

/** 기본으로 켜지는 카테고리. */
export const DEFAULT_VISIBLE_CATEGORIES: readonly PoiCategory[] = POI_CATEGORIES.filter(
  (c) => POI_CATEGORY_META[c].defaultVisible,
);

/**
 * 사찰 판정에서 뺄 이름. `사`·`암` 으로 끝나는 2~4글자 규칙에 걸리지만 절이 아닌 것들.
 * '역사'·'급경사' 는 5글자 이상 문장 끝에도 붙지만 길이 조건에서 이미 빠진다.
 */
const TEMPLE_STOPLIST = /^(기암|독사|역사|급경사|사거리)$/;

/**
 * 절 이름인가. 실측상 절은 '석남사'·'보리암' 처럼 2~4글자에 `사`/`암` 으로 끝난다.
 * '가지산 석남사' 처럼 산 이름이 붙은 긴 형태는 놓치지만, '입암산성의 역사'·'정상 급경사'
 * 같은 오탐을 막는 쪽을 택했다. 오탐은 지도에 잘못된 색 점으로 남지만 미탐은 회색이 될 뿐이다.
 */
function isTempleName(name: string): boolean {
  if (name.length < 2 || name.length > 4) return false;
  if (!/[사암]$/.test(name)) return false;
  return !TEMPLE_STOPLIST.test(name);
}

/**
 * 정상·봉우리인가. `봉` 은 '봉암사'·'봉천대' 처럼 이름 첫머리에도 흔해서 단어 끝에 올 때만 본다.
 * '삼불봉고개 쉼터' 가 정상으로 잡히지 않아야 쉼터로 내려간다.
 */
const PEAK_PATTERN = /정상|봉$|봉[\s(.·]/;

/**
 * 우선순위 순서의 규칙표. 위에서부터 처음 맞는 카테고리가 답이다.
 *
 * 위험 > 대피소 > 화장실 > 주차장 > 식수 > 국가지점번호 > 조망 > 폭포 > 사찰 > 정상 > 쉼터 > 갈림길 > 이정표.
 * '연주암 화장실' 은 사찰이 아니라 화장실이어야 하므로 시설이 장소보다 앞선다.
 * '쌀개봉 조망점' 은 정상이 아니라 조망이어야 하므로 조망이 정상보다 앞선다.
 */
const RULES: readonly [PoiCategory, (name: string) => boolean][] = [
  ['danger', (n) => /출입금지|위험|통제|낙석|추락/.test(n)],
  ['refuge', (n) => /대피소/.test(n)],
  ['toilet', (n) => /화장실|해우소/.test(n)],
  ['parking', (n) => /주차/.test(n)],
  ['water', (n) => /약수|샘|식수/.test(n)],
  ['emergency', (n) => /국가지점번호/.test(n)],
  ['viewpoint', (n) => /조망|전망/.test(n)],
  ['waterfall', (n) => /폭포|계곡/.test(n)],
  ['temple', isTempleName],
  ['peak', (n) => PEAK_PATTERN.test(n)],
  ['shelter', (n) => /쉼터/.test(n)],
  ['junction', (n) => /갈림길/.test(n)],
  ['signpost', (n) => /이정표|이정목|표지|안내|웨이포인트/.test(n)],
];

/** POI 이름 → 카테고리. 빈 이름·비문자열은 `other`. */
export function categorizePoi(name: unknown): PoiCategory {
  if (typeof name !== 'string') return 'other';
  const trimmed = name.trim();
  if (!trimmed) return 'other';
  const hit = RULES.find(([, test]) => test(trimmed));
  return hit ? hit[0] : 'other';
}

/** feature.properties 에 붙는 카테고리 키. 지도 표현식·필터가 이 이름으로 읽는다. */
export const POI_CATEGORY_PROPERTY = 'category';

/**
 * POI FeatureCollection 의 각 feature 에 `category` 를 붙인 새 컬렉션.
 * 원본은 건드리지 않는다 — 번들은 정적 파일이고 캐시로도 공유된다.
 */
export function withPoiCategories(pois: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    ...pois,
    features: pois.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        [POI_CATEGORY_PROPERTY]: categorizePoi(feature.properties?.['이름']),
      },
    })),
  };
}

/** 코스 카드 한 줄 요약에 들어가는 카테고리. 순서가 곧 표시 순서다. */
export const SUMMARY_CATEGORIES = ['toilet', 'shelter', 'viewpoint', 'water', 'danger'] as const;

export type CourseSummary = Record<(typeof SUMMARY_CATEGORIES)[number], number>;

const EMPTY_SUMMARY: CourseSummary = { toilet: 0, shelter: 0, viewpoint: 0, water: 0, danger: 0 };

/**
 * 한 코스(`properties.코스ID`, 문자열)에 속한 POI 를 카테고리별로 센다.
 * feature 에 `category` 가 이미 붙어 있으면 그것을, 없으면 이름으로 다시 분류한다.
 */
export function summarizeCourse(pois: GeoJSON.FeatureCollection, courseId: string): CourseSummary {
  return pois.features.reduce<CourseSummary>((acc, feature) => {
    const props = feature.properties;
    if (props?.['코스ID'] !== courseId) return acc;
    const category = (props[POI_CATEGORY_PROPERTY] as PoiCategory | undefined) ?? categorizePoi(props['이름']);
    if (!(category in acc)) return acc;
    return { ...acc, [category]: acc[category as keyof CourseSummary] + 1 };
  }, EMPTY_SUMMARY);
}

/** 요약 표시 문구. `🚻 2 · 쉼터 3 · 조망 1 · 💧 1 · ⚠ 1`. 0 은 빼고, 전부 0 이면 null. */
export function formatCourseSummary(summary: CourseSummary): string | null {
  const icon: Record<keyof CourseSummary, string> = {
    toilet: '🚻',
    shelter: '쉼터',
    viewpoint: '조망',
    water: '💧',
    danger: '⚠',
  };
  const parts = SUMMARY_CATEGORIES.filter((c) => summary[c] > 0).map((c) => `${icon[c]} ${summary[c]}`);
  return parts.length === 0 ? null : parts.join(' · ');
}
