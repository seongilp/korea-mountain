import { NextResponse } from 'next/server';

import { API } from '@/lib/api-registry';
import { callDataGo, DataGoFailure, extractItems } from '@/lib/datago';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 봉우리 위험지역 POI. lat/lot 은 WGS84(실측 확인), lot 이 경도인 점에 주의. */
interface RawDangerPoi {
  poiId: string;
  frtrlNm: string;
  lat: string;
  lot: string;
  aslAltide: string;
  plcNm: string;
  explnCn: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const rows = Number(url.searchParams.get('rows')) || 100;

  try {
    const payload = await callDataGo<unknown>(
      API.dangerPoi,
      { pageNo: 1, numOfRows: Math.min(rows, 1000) },
      { revalidate: 86_400 },
    );
    const { items, totalCount } = extractItems<RawDangerPoi>(payload);

    return NextResponse.json({
      totalCount,
      items: items.map((item) => ({
        id: item.poiId,
        name: item.frtrlNm,
        lon: Number(item.lot),
        lat: Number(item.lat),
        alt: Number(item.aslAltide),
        kind: item.plcNm,
        note: item.explnCn,
      })),
    });
  } catch (error) {
    if (error instanceof DataGoFailure) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
