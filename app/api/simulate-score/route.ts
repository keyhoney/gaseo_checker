import { NextResponse } from "next/server";
import type { SimulateScoreRequest, SimulateScoreResponse } from "@/lib/types";

function calcTotal(scores: { seo: number; aeo: number; geo: number; cwv: number }) {
  return Number((0.35 * scores.seo + 0.25 * scores.aeo + 0.2 * scores.geo + 0.2 * scores.cwv).toFixed(2));
}

export async function POST(req: Request) {
  const body = (await req.json()) as SimulateScoreRequest;
  const before = {
    ...body.baseScores,
    total: calcTotal(body.baseScores),
  };

  const effect = body.selectedActions.reduce(
    (acc, action) => {
      if (action.id.startsWith("SEO-")) acc.seo += 1.8;
      else if (action.id.startsWith("AEO-")) acc.aeo += 2.5;
      else if (action.id.startsWith("GEO-")) acc.geo += 1.7;
      return acc;
    },
    { seo: 0, aeo: 0, geo: 0 },
  );

  const after = {
    seo: Number(Math.min(100, before.seo + effect.seo).toFixed(2)),
    aeo: Number(Math.min(100, before.aeo + effect.aeo).toFixed(2)),
    geo: Number(Math.min(100, before.geo + effect.geo).toFixed(2)),
    cwv: before.cwv,
    total: 0,
  };
  after.total = calcTotal(after);

  const response: SimulateScoreResponse = {
    before,
    after,
    delta: {
      seo: Number((after.seo - before.seo).toFixed(2)),
      aeo: Number((after.aeo - before.aeo).toFixed(2)),
      geo: Number((after.geo - before.geo).toFixed(2)),
      cwv: Number((after.cwv - before.cwv).toFixed(2)),
      total: Number((after.total - before.total).toFixed(2)),
    },
    topImpactActions: body.selectedActions.map((item, idx) => ({
      id: item.id,
      impactScore: Number((0.9 - idx * 0.08).toFixed(2)),
    })),
    note: "시뮬레이션 값은 예상치이며 실제 재분석 결과와 차이가 있을 수 있습니다.",
  };

  return NextResponse.json(response, { status: 200 });
}
