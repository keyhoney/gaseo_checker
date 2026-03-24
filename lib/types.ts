export const SUPPORTED_PLATFORMS = ["naver", "tistory", "blogspot"] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export type ErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PLATFORM"
  | "PLATFORM_MISMATCH"
  | "FETCH_FAILED"
  | "PARSE_FAILED"
  | "PSI_FAILED"
  | "GEMINI_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type AnalyzeState =
  | "idle"
  | "validating"
  | "analyzing"
  | "success_ok"
  | "success_degraded"
  | "history_ready"
  | "simulating"
  | "error_failed";

export interface AnalyzeRequest {
  platform: string;
  url: string;
}

export interface AnalyzeSuccessData {
  platform: Platform;
  url: string;
  normalizedUrl: string;
}

export interface ParsedAnalyzeSuccessData extends AnalyzeSuccessData {
  status: "success_ok" | "success_degraded";
  parsed: {
    title: string;
    bodyText: string;
    headings: string[];
    parserMeta: {
      parserVersion: string;
      contentSelectorUsed: string;
      fallbackDepth: number;
      noiseBlocksRemoved: number;
    };
    metrics: {
      h1Count: number;
      h2Count: number;
      h3Count: number;
      paragraphCount: number;
      listItemCount: number;
      externalLinkCount: number;
      sentenceCount: number;
      avgSentenceLength: number;
      introHasSummary: boolean;
      titleKeywordInBodyTop: boolean;
      questionHeadingCount: number;
    };
  };
  seo: {
    score: number;
    confidence: number;
    items: RuleItem[];
  };
  aeo: {
    score: number;
    confidence: number;
    items: RuleItem[];
  };
  geo: {
    score: number;
    confidence: number;
    items: RuleItem[];
  };
  webVitals: {
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
  };
  searchQuality: {
    diaScore: number;
    eeatScore: number;
    confidence: number;
    ymyl: {
      isYmyl: boolean;
      matches: string[];
    };
  };
  aiInsights: {
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
  };
}

export type RuleStatus = "pass" | "warn" | "fail";

export interface RuleItem {
  id: string;
  status: RuleStatus;
  message: string;
  highlights?: Array<{
    type: "paragraph" | "section";
    excerpt: string;
    startOffset: number;
    endOffset: number;
  }>;
}

export interface AnalyzeError {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
  policyStop?: boolean;
}

export interface AnalyzeResponseEnvelope {
  requestId: string;
  timestamp: string;
  data: ParsedAnalyzeSuccessData | null;
  partialErrors?: Array<{
    code: "PSI_FAILED" | "GEMINI_FAILED";
    message: string;
    scope: "webVitals" | "aiInsights";
    retryable: true;
  }>;
  error: AnalyzeError | null;
}

export interface SimulateScoreRequest {
  platform: Platform;
  url: string;
  baseScores: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
  };
  selectedActions: Array<{
    id: string;
    expectedStatus: RuleStatus;
  }>;
}

export interface SimulateScoreResponse {
  before: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
    total: number;
  };
  after: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
    total: number;
  };
  delta: {
    seo: number;
    aeo: number;
    geo: number;
    cwv: number;
    total: number;
  };
  topImpactActions: Array<{
    id: string;
    impactScore: number;
  }>;
  note: string;
}
