import { HARD_RULE_IDS } from "@/lib/rulesEngine";
import type { RuleItem } from "@/lib/types";

export interface GeminiInsight {
  provider: "gemini";
  model: "gemini-3-flash";
  status: "ok" | "degraded";
  summary: string[];
  topActions: Array<{
    title: string;
    why: string;
    how: string;
    impact: "high" | "medium" | "low";
    effort: "high" | "medium" | "low";
    evidenceIds: string[];
  }>;
  quickChecklist: Array<{
    task: string;
    doneWhen: string;
    evidenceIds: string[];
  }>;
  assumptions: string[];
  warnings: string[];
  overallConfidence: number;
  aiAdjustmentApplied: boolean;
  scoreAdjustments: Array<{
    domain: "seo" | "aeo" | "geo";
    delta: number;
    reason: string;
    confidence: number;
    evidenceIds: string[];
  }>;
}

function makeFallback(warnings: string[]): GeminiInsight {
  return {
    provider: "gemini",
    model: "gemini-3-flash",
    status: "degraded",
    summary: [],
    topActions: [],
    quickChecklist: [],
    assumptions: [],
    warnings,
    overallConfidence: 0,
    aiAdjustmentApplied: false,
    scoreAdjustments: [],
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function applyAiScoreAdjustments(
  base: { seo: number; aeo: number; geo: number },
  ai: GeminiInsight,
  validRuleIds: Set<string>,
) {
  if (ai.status !== "ok" || ai.overallConfidence < 0.7) return base;

  const next = { ...base };
  for (const adj of ai.scoreAdjustments) {
    const hasInvalidEvidence = adj.evidenceIds.some((id) => !validRuleIds.has(id));
    const hasHardRule = adj.evidenceIds.some((id) => HARD_RULE_IDS.has(id));
    if (hasInvalidEvidence || hasHardRule) continue;
    if (adj.domain === "seo") continue;
    const bounded = clamp(adj.delta, -10, 10);
    next[adj.domain] = clamp(Number((next[adj.domain] + bounded).toFixed(2)), 0, 100);
  }
  return next;
}

export async function fetchGeminiInsights(params: {
  apiKey: string;
  text: string;
  rules: RuleItem[];
  ymyl: { isYmyl: boolean; matches: string[] };
  fetchImpl?: typeof fetch;
}): Promise<GeminiInsight> {
  const fetchImpl = params.fetchImpl ?? fetch;
  try {
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const prompt = {
      text: params.text.slice(0, 1800),
      rules: params.rules.slice(0, 20),
      ymyl: params.ymyl,
      schema: "summary,topActions,quickChecklist,overallConfidence,scoreAdjustments",
    };
    const res = await fetchImpl(`${endpoint}?key=${params.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: JSON.stringify(prompt) }] }],
      }),
    });
    if (!res.ok) {
      return makeFallback(["AI 보강 결과를 생성하지 못했습니다. 규칙 기반 결과만 제공합니다."]);
    }
    const payload = await res.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== "string") {
      return makeFallback(["AI 보강 결과를 생성하지 못했습니다. 규칙 기반 결과만 제공합니다."]);
    }
    const parsed = JSON.parse(rawText);
    const summary = Array.isArray(parsed.summary) ? parsed.summary.slice(0, 5) : [];
    const topActions = Array.isArray(parsed.topActions) ? parsed.topActions.slice(0, 5) : [];
    const quickChecklist = Array.isArray(parsed.quickChecklist) ? parsed.quickChecklist.slice(0, 8) : [];
    const scoreAdjustments = Array.isArray(parsed.scoreAdjustments) ? parsed.scoreAdjustments : [];

    return {
      provider: "gemini",
      model: "gemini-3-flash",
      status: "ok",
      summary,
      topActions,
      quickChecklist,
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      warnings: params.ymyl.isYmyl
        ? [
            "이 주제는 건강/금융/법률 등 민감 영역일 수 있어, 실제 의사결정 전 전문가 검토를 권장합니다.",
          ]
        : [],
      overallConfidence:
        typeof parsed.overallConfidence === "number" ? parsed.overallConfidence : 0.75,
      aiAdjustmentApplied: false,
      scoreAdjustments,
    };
  } catch {
    return makeFallback(["AI 보강 결과를 생성하지 못했습니다. 규칙 기반 결과만 제공합니다."]);
  }
}
