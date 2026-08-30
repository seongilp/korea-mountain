/**
 * 산별 부가 안내 문구.
 *
 * 왜 있나: 어떤 산은 통제 구간 때문에 등산로가 서로 이어지지 않아, 지도만 보면
 * "코스가 끊겼다"고 오해하기 쉽다. 데이터 자체는 정확하므로 좌표는 손대지 않고
 * **표시 문구만** 한 줄 얹어 왜 그런지 설명한다.
 *
 * 키는 100대명산 산 이름이다. 100대명산 목록에서 이름은 고유하므로 안전한 키다.
 * 다만 전국 봉우리 데이터에는 같은 이름(도덕산·옥녀봉 등)이 섞일 수 있으니,
 * 호출부(`mountainNote`)에서 **100대명산 데이터셋일 때만** 조회하도록 강제한다.
 *
 * 확장: 통제로 코스가 안 이어지는 산(지리산·설악산 일부 등)이 더 있으면 여기에
 * 한 줄씩 추가하면 된다. 데이터 파일에 새 필드를 파지 않는다 — 표시 전용 상수다.
 */
const MYEONGSAN_NOTES: Record<string, string> = {
  한라산:
    '한라산 정상(백록담)은 성판악·관음사 코스로만 오를 수 있습니다. 남벽 구간이 통제되어 영실·어리목·돈내코 코스는 정상까지 이어지지 않습니다.',
};

/**
 * 선택한 산의 부가 안내를 돌려준다.
 *
 * `isMyeongsan` 이 아닐 때는 무조건 undefined — 봉우리 데이터의 동명 산에
 * 100대명산용 문구가 잘못 뜨는 것을 막는다.
 */
export function mountainNote(name: string | undefined, isMyeongsan: boolean): string | undefined {
  if (!isMyeongsan || !name) return undefined;
  return MYEONGSAN_NOTES[name];
}
