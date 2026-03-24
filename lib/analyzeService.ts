import { randomUUID } from "node:crypto";
import { ERROR_MESSAGES } from "@/lib/errors";
import { applyAiScoreAdjustments, fetchGeminiInsights } from "@/lib/geminiClient";
import { fetchHtml } from "@/lib/htmlFetch";
import { parseBlogHtml } from "@/lib/parserAdapters";
import { fetchPsiWebVitals } from "@/lib/psiClient";
import { runRulesEngine } from "@/lib/rulesEngine";
import type { AnalyzeRequest, AnalyzeResponseEnvelope } from "@/lib/types";
import { validateAnalyzeInput } from "@/lib/urlValidation";
import { detectYmyl } from "@/lib/ymyl";

export async function analyzeRequest(
  body: AnalyzeRequest | null,
): Promise<{ status: number; response: AnalyzeResponseEnvelope }> {
  const requestId = randomUUID();
  const timestamp = new Date().toISOString();

  if (!body) {
    return {
      status: 400,
      response: {
        requestId,
        timestamp,
        data: null,
        error: {
          code: "INVALID_URL",
          message: ERROR_MESSAGES.INVALID_URL,
        },
      },
    };
  }

  const validation = validateAnalyzeInput(body);
  if (!validation.ok) {
    return {
      status: validation.error.code === "INVALID_URL" ? 400 : 422,
      response: {
        requestId,
        timestamp,
        data: null,
        error: validation.error,
      },
    };
  }

  let html: string;
  try {
    html = await fetchHtml(validation.data.normalizedUrl);
  } catch {
    return {
      status: 503,
      response: {
        requestId,
        timestamp,
        data: null,
        error: {
          code: "FETCH_FAILED",
          message: ERROR_MESSAGES.FETCH_FAILED,
        },
      },
    };
  }

  const parsed = parseBlogHtml(validation.data.platform, html);
  if (!parsed) {
    return {
      status: 503,
      response: {
        requestId,
        timestamp,
        data: null,
        error: {
          code: "PARSE_FAILED",
          message: ERROR_MESSAGES.PARSE_FAILED,
        },
      },
    };
  }
  const ruleResult = runRulesEngine(parsed);
  const partialErrors: NonNullable<AnalyzeResponseEnvelope["partialErrors"]> = [];
  let webVitals:
    | {
        source: "psi";
        strategy: "mobile";
        measurementPolicy: {
          runs: 3;
          aggregation: "median";
          highVariance: boolean;
        };
        lab: {
          lcp: { value: number; unit: "s" } | null;
          inp: { value: number; unit: "ms"; note: "lab" } | null;
          cls: { value: number } | null;
        };
        field: {
          lcp: { value: number; unit: "ms" } | null;
          inp: { value: number; unit: "ms" } | null;
          cls: { value: number } | null;
        };
        confidence: number;
      }
    | null = null;

  const forcePsiFail = body.url.includes("__forcePsiFail=1");
  if (!forcePsiFail) {
    try {
      const apiKey = process.env.PSI_API_KEY;
      if (!apiKey) {
        throw new Error("PSI_API_KEY_MISSING");
      }
      const psi = await fetchPsiWebVitals(validation.data.normalizedUrl, apiKey);
      webVitals = {
        source: "psi",
        strategy: "mobile",
        measurementPolicy: psi.measurementPolicy,
        lab: psi.lab,
        field: psi.field,
        confidence: psi.confidence,
      };
    } catch {
      webVitals = null;
    }
  }
  if (!webVitals) {
    partialErrors.push({
      code: "PSI_FAILED",
      message: ERROR_MESSAGES.PSI_FAILED,
      scope: "webVitals",
      retryable: true,
    });
    webVitals = {
      source: "psi",
      strategy: "mobile",
      measurementPolicy: {
        runs: 3,
        aggregation: "median",
        highVariance: false,
      },
      lab: {
        lcp: null,
        inp: null,
        cls: null,
      },
      field: {
        lcp: null,
        inp: null,
        cls: null,
      },
      confidence: 0,
    };
  }

  const ymyl = detectYmyl(`${parsed.title} ${parsed.bodyText.slice(0, 1000)}`);
  const allRuleItems = [...ruleResult.seo.items, ...ruleResult.aeo.items, ...ruleResult.geo.items];

  const forceGeminiFail = body.url.includes("__forceGeminiFail=1");
  let aiInsights = await (async () => {
    if (forceGeminiFail || !process.env.GEMINI_API_KEY) {
      return {
        provider: "gemini" as const,
        model: "gemini-3-flash" as const,
        status: "degraded" as const,
        summary: [],
        topActions: [],
        quickChecklist: [],
        assumptions: [],
        warnings: [
          ERROR_MESSAGES.GEMINI_FAILED,
          ...(ymyl.isYmyl
            ? [
                "이 주제는 건강/금융/법률 등 민감 영역일 수 있어, 실제 의사결정 전 전문가 검토를 권장합니다.",
              ]
            : []),
        ],
        overallConfidence: 0,
        aiAdjustmentApplied: false,
        scoreAdjustments: [],
      };
    }
    return fetchGeminiInsights({
      apiKey: process.env.GEMINI_API_KEY,
      text: parsed.bodyText,
      rules: allRuleItems,
      ymyl,
    });
  })();

  if (aiInsights.status === "degraded") {
    partialErrors.push({
      code: "GEMINI_FAILED",
      message: ERROR_MESSAGES.GEMINI_FAILED,
      scope: "aiInsights",
      retryable: true,
    });
  }

  const adjustedScores = applyAiScoreAdjustments(
    { seo: ruleResult.seo.score, aeo: ruleResult.aeo.score, geo: ruleResult.geo.score },
    aiInsights,
    new Set(allRuleItems.map((item) => item.id)),
  );
  aiInsights = {
    ...aiInsights,
    aiAdjustmentApplied:
      aiInsights.status === "ok" &&
      (adjustedScores.aeo !== ruleResult.aeo.score || adjustedScores.geo !== ruleResult.geo.score),
  };

  return {
    status: 200,
    response: {
      requestId,
      timestamp,
      data: {
        ...validation.data,
        status: partialErrors.length > 0 ? "success_degraded" : "success_ok",
        parsed,
        seo: { ...ruleResult.seo, score: adjustedScores.seo },
        aeo: { ...ruleResult.aeo, score: adjustedScores.aeo },
        geo: { ...ruleResult.geo, score: adjustedScores.geo },
        webVitals,
        searchQuality: {
          diaScore: Number(((ruleResult.aeo.score * 0.6 + ruleResult.geo.score * 0.4) * (ymyl.isYmyl ? 0.95 : 1)).toFixed(2)),
          eeatScore: Number(((ruleResult.geo.score * 0.7 + ruleResult.seo.score * 0.3) * (ymyl.isYmyl ? 0.9 : 1)).toFixed(2)),
          confidence: Number(((ruleResult.aeo.confidence + ruleResult.geo.confidence) / 2).toFixed(2)),
          ymyl,
        },
        aiInsights,
      },
      partialErrors: partialErrors.length > 0 ? partialErrors : undefined,
      error: null,
    },
  };
}
