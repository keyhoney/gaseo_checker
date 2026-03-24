import type { ParsedAnalyzeSuccessData } from "@/lib/types";
import type { RegressionResult } from "@/lib/history";

interface SharePayload {
  shareVersion: "v1";
  platform: string;
  url: string;
  fetchedAt: string;
  scores: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
  };
  confidence: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
  };
  sq: {
    diaScore: number;
    eeatScore: number;
  };
  topActions: Array<{ title: string; impact: string }>;
  quickChecklist: Array<{ task: string }>;
  trend: RegressionResult["trend"];
  deltaTotal: number;
  whyScoreChanged: RegressionResult["whyScoreChanged"];
}

function base64urlEncode(input: string): string {
  const base64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(input)))
      : Buffer.from(input, "utf8").toString("base64");
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(padded)));
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

function buildPayload(
  data: ParsedAnalyzeSuccessData,
  regression: RegressionResult | null,
  limits: { actions: number; checklist: number; why: number },
): SharePayload {
  return {
    shareVersion: "v1",
    platform: data.platform,
    url: data.normalizedUrl,
    fetchedAt: new Date().toISOString(),
    scores: {
      seo: data.seo.score,
      aeo: data.aeo.score,
      geo: data.geo.score,
      cwv: Number((data.webVitals.confidence * 100).toFixed(2)),
    },
    confidence: {
      seo: data.seo.confidence,
      aeo: data.aeo.confidence,
      geo: data.geo.confidence,
      cwv: data.webVitals.confidence,
    },
    sq: {
      diaScore: data.searchQuality.diaScore,
      eeatScore: data.searchQuality.eeatScore,
    },
    topActions: data.aiInsights.topActions.slice(0, limits.actions).map((a) => ({
      title: a.title,
      impact: a.impact,
    })),
    quickChecklist: data.aiInsights.quickChecklist.slice(0, limits.checklist).map((q) => ({ task: q.task })),
    trend: regression?.trend ?? "unchanged",
    deltaTotal: regression?.delta.total ?? 0,
    whyScoreChanged: (regression?.whyScoreChanged ?? []).slice(0, limits.why),
  };
}

export function createShareLink(
  origin: string,
  data: ParsedAnalyzeSuccessData,
  regression: RegressionResult | null,
): { url: string; mode: "normal" | "warning" | "minimal"; length: number } {
  const attempts = [
    { actions: 3, checklist: 5, why: 5, mode: "normal" as const },
    { actions: 2, checklist: 3, why: 2, mode: "warning" as const },
    { actions: 1, checklist: 1, why: 0, mode: "minimal" as const },
  ];
  for (const attempt of attempts) {
    const payload = buildPayload(data, regression, attempt);
    const encoded = base64urlEncode(JSON.stringify(payload));
    const url = `${origin}/share?r=${encoded}`;
    if (url.length <= 1800) return { url, mode: attempt.mode, length: url.length };
    if (attempt.mode === "warning" && url.length <= 3500) return { url, mode: "warning", length: url.length };
    if (attempt.mode === "minimal") return { url, mode: "minimal", length: url.length };
  }
  throw new Error("SHARE_GENERATION_FAILED");
}

export function parseShareToken(token: string): SharePayload {
  const decoded = base64urlDecode(token);
  return JSON.parse(decoded) as SharePayload;
}
