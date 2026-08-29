import { NextResponse } from 'next/server';

import { DataGoFailure } from '@/lib/datago';
import { fetchLatestObservations } from '@/lib/mtweather';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  try {
    const { observedAt, stations } = await fetchLatestObservations();
    return NextResponse.json(
      { observedAt, count: stations.length, stations },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=7200' } },
    );
  } catch (error) {
    if (error instanceof DataGoFailure) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
