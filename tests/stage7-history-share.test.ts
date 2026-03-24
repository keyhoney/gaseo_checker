import { describe, expect, it } from "vitest";
import { compareHistory, mergeHistory, toHistoryItem, type HistoryItem } from "@/lib/history";
import { createShareLink, parseShareToken } from "@/lib/share";
import type { ParsedAnalyzeSuccessData } from "@/lib/types";

function mockData(overrides?: Partial<ParsedAnalyzeSuccessData>): ParsedAnalyzeSuccessData {
  return {
    platform: "naver",
    url: "https://blog.naver.com/u/1",
    normalizedUrl: "https://blog.naver.com/u/1",
    status: "success_ok",
    parsed: {
      title: "t",
      bodyText: "b",
      headings: [],
      parserMeta: {
        parserVersion: "v1",
        contentSelectorUsed: "article",
        fallbackDepth: 1,
        noiseBlocksRemoved: 0,
      },
      metrics: {
        h1Count: 1,
        h2Count: 1,
        h3Count: 0,
        paragraphCount: 2,
        listItemCount: 0,
        externalLinkCount: 1,
        sentenceCount: 3,
        avgSentenceLength: 20,
        introHasSummary: true,
        titleKeywordInBodyTop: true,
        questionHeadingCount: 1,
      },
    },
    seo: { score: 70, confidence: 0.8, items: [] },
    aeo: { score: 60, confidence: 0.7, items: [] },
    geo: { score: 55, confidence: 0.7, items: [] },
    webVitals: {
      source: "psi",
      strategy: "mobile",
      measurementPolicy: { runs: 3, aggregation: "median", highVariance: false },
      lab: { lcp: { value: 2.3, unit: "s" }, inp: { value: 190, unit: "ms", note: "lab" }, cls: { value: 0.08 } },
      field: { lcp: null, inp: null, cls: null },
      confidence: 0.8,
    },
    searchQuality: { diaScore: 65, eeatScore: 67, confidence: 0.7, ymyl: { isYmyl: false, matches: [] } },
    aiInsights: {
      provider: "gemini",
      model: "gemini-3-flash",
      status: "ok",
      summary: [],
      topActions: [{ title: "a", why: "w", how: "h", impact: "high", effort: "low", evidenceIds: ["AEO-02"] }],
      quickChecklist: [{ task: "q", doneWhen: "d", evidenceIds: ["AEO-02"] }],
      assumptions: [],
      warnings: [],
      overallConfidence: 0.8,
      aiAdjustmentApplied: false,
      scoreAdjustments: [],
    },
    ...overrides,
  };
}

describe("7단계 히스토리 정책", () => {
  it("URL당 최대 10건 유지", () => {
    const base = toHistoryItem(mockData());
    const prev: HistoryItem[] = Array.from({ length: 12 }).map((_, i) => ({
      ...base,
      analysisId: `id-${i}`,
      analyzedAt: new Date(Date.now() - i * 1000).toISOString(),
    }));
    const merged = mergeHistory(prev, { ...base, analysisId: "new" });
    expect(merged.length).toBe(10);
    expect(merged[0].analysisId).toBe("new");
  });

  it("30일 TTL 지난 데이터 정리", () => {
    const base = toHistoryItem(mockData());
    const old = {
      ...base,
      analysisId: "old",
      analyzedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const merged = mergeHistory([old], { ...base, analysisId: "new" });
    expect(merged.some((i) => i.analysisId === "old")).toBe(false);
  });

  it("회귀 판정 improved/regressed/unchanged 계산", () => {
    const prev = toHistoryItem(mockData());
    const improved = { ...prev, scores: { ...prev.scores, total: prev.scores.total + 3, seo: prev.scores.seo + 3 } };
    const regressed = { ...prev, scores: { ...prev.scores, total: prev.scores.total - 3, seo: prev.scores.seo - 3 } };
    const unchanged = { ...prev, scores: { ...prev.scores, total: prev.scores.total + 1 } };
    expect(compareHistory(prev, improved).trend).toBe("improved");
    expect(compareHistory(prev, regressed).trend).toBe("regressed");
    expect(compareHistory(prev, unchanged).trend).toBe("unchanged");
  });
});

describe("7단계 공유 링크", () => {
  it("공유 링크 생성 후 핵심 데이터 복원", () => {
    const data = mockData();
    const regression = compareHistory(null, toHistoryItem(data));
    const shared = createShareLink("http://localhost:3000", data, regression);
    const token = new URL(shared.url).searchParams.get("r");
    expect(token).toBeTruthy();
    const parsed = parseShareToken(token!);
    expect(parsed.platform).toBe("naver");
    expect(parsed.scores.seo).toBe(data.seo.score);
    expect(parsed.sq.diaScore).toBe(data.searchQuality.diaScore);
  });

  it("긴 payload는 가드레일 모드로 축약", () => {
    const data = mockData({
      aiInsights: {
        ...mockData().aiInsights,
        topActions: Array.from({ length: 20 }).map((_, i) => ({
          title: `title-${i}`.repeat(20),
          why: "w",
          how: "h",
          impact: "high",
          effort: "low",
          evidenceIds: ["AEO-02"],
        })),
        quickChecklist: Array.from({ length: 20 }).map((_, i) => ({
          task: `task-${i}`.repeat(20),
          doneWhen: "d",
          evidenceIds: ["AEO-02"],
        })),
      },
    });
    const shared = createShareLink("http://localhost:3000", data, null);
    expect(["normal", "warning", "minimal"]).toContain(shared.mode);
    expect(shared.url.includes("/share?r=")).toBe(true);
  });
});
