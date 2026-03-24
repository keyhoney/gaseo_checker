import type { ParsedAnalyzeSuccessData } from "@/lib/types";

export interface HistoryItem {
  analysisId: string;
  platform: string;
  url: string;
  analyzedAt: string;
  scores: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
    total: number;
  };
  status: "success_ok" | "success_degraded";
}

export interface RegressionResult {
  delta: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
    total: number;
  };
  trend: "improved" | "regressed" | "unchanged";
  whyScoreChanged: Array<{
    ruleId: string;
    domain: "seo" | "aeo" | "geo" | "cwv";
    delta: number;
    reason: string;
  }>;
}

function totalScore(scores: { seo: number; aeo: number; geo: number; cwv: number }) {
  return Number((0.35 * scores.seo + 0.25 * scores.aeo + 0.2 * scores.geo + 0.2 * scores.cwv).toFixed(2));
}

export function toHistoryItem(data: ParsedAnalyzeSuccessData): HistoryItem {
  const cwv = Number((data.webVitals.confidence * 100).toFixed(2));
  return {
    analysisId: `local-${Date.now()}`,
    platform: data.platform,
    url: data.normalizedUrl,
    analyzedAt: new Date().toISOString(),
    scores: {
      seo: data.seo.score,
      aeo: data.aeo.score,
      geo: data.geo.score,
      cwv,
      total: totalScore({ seo: data.seo.score, aeo: data.aeo.score, geo: data.geo.score, cwv }),
    },
    status: data.status,
  };
}

export function mergeHistory(
  prev: HistoryItem[],
  next: HistoryItem,
  now: number = Date.now(),
): HistoryItem[] {
  const ttlMs = 30 * 24 * 60 * 60 * 1000;
  const filtered = prev.filter((item) => now - new Date(item.analyzedAt).getTime() <= ttlMs);
  const merged = [next, ...filtered].slice(0, 10);
  return merged;
}

export function compareHistory(prev: HistoryItem | null, current: HistoryItem): RegressionResult {
  if (!prev) {
    return {
      delta: { seo: 0, aeo: 0, geo: 0, cwv: 0, total: 0 },
      trend: "unchanged",
      whyScoreChanged: [],
    };
  }
  const delta = {
    seo: Number((current.scores.seo - prev.scores.seo).toFixed(2)),
    aeo: Number((current.scores.aeo - prev.scores.aeo).toFixed(2)),
    geo: Number((current.scores.geo - prev.scores.geo).toFixed(2)),
    cwv: Number((current.scores.cwv - prev.scores.cwv).toFixed(2)),
    total: Number((current.scores.total - prev.scores.total).toFixed(2)),
  };
  const trend = delta.total >= 2 ? "improved" : delta.total <= -2 ? "regressed" : "unchanged";
  const whyScoreChanged = ([
    ["seo", delta.seo],
    ["aeo", delta.aeo],
    ["geo", delta.geo],
    ["cwv", delta.cwv],
  ] as const)
    .filter(([, d]) => d !== 0)
    .map(([domain, d]) => ({
      ruleId: `${domain.toUpperCase()}-DELTA`,
      domain,
      delta: d,
      reason: `${domain.toUpperCase()} 점수 변화`,
    }));

  return { delta, trend, whyScoreChanged };
}
