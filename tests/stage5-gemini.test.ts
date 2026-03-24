import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRequest } from "@/lib/analyzeService";
import { detectYmyl } from "@/lib/ymyl";

const htmlSample = `
<html>
  <head><title>건강 정보 글 작성 가이드</title></head>
  <body>
    <div class="se-main-container">
      <h1>건강 정보 글 작성 가이드</h1>
      <h2>왜 중요한가?</h2>
      <p>요약: 복용법과 부작용 안내를 정확히 제공해야 합니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다.</p>
      <a href="https://example.com/source">출처</a>
    </div>
  </body>
</html>
`;

function geminiPayload() {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                summary: ["핵심 요약 1", "핵심 요약 2"],
                topActions: [
                  {
                    title: "도입부 개선",
                    why: "가독성 향상",
                    how: "첫 문단 구조화",
                    impact: "high",
                    effort: "low",
                    evidenceIds: ["AEO-02"],
                  },
                ],
                quickChecklist: [
                  {
                    task: "요약 문장 추가",
                    doneWhen: "첫 300자 내 결론 1문장",
                    evidenceIds: ["AEO-02"],
                  },
                ],
                assumptions: [],
                overallConfidence: 0.82,
                scoreAdjustments: [
                  {
                    domain: "aeo",
                    delta: 4,
                    reason: "문맥 개선 기대",
                    confidence: 0.8,
                    evidenceIds: ["AEO-02"],
                  },
                  {
                    domain: "seo",
                    delta: 8,
                    reason: "하드룰 테스트",
                    confidence: 0.8,
                    evidenceIds: ["SEO-01"],
                  },
                ],
              }),
            },
          ],
        },
      },
    ],
  };
}

function psiPayload() {
  return {
    lighthouseResult: {
      audits: {
        "largest-contentful-paint": { numericValue: 2200 },
        "interaction-to-next-paint": { numericValue: 190 },
        "cumulative-layout-shift": { numericValue: 0.07 },
      },
    },
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400 },
        INTERACTION_TO_NEXT_PAINT: { percentile: 170 },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 7 },
      },
    },
  };
}

describe("5단계 Gemini + YMYL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PSI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("Gemini 성공 시 aiInsights 스키마를 채운다", async () => {
    process.env.PSI_API_KEY = "dummy";
    process.env.GEMINI_API_KEY = "dummy";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const href = input.toString();
        if (href.includes("runPagespeed")) return { ok: true, json: async () => psiPayload() };
        if (href.includes("generativelanguage.googleapis.com")) {
          return { ok: true, json: async () => geminiPayload() };
        }
        return { ok: true, status: 200, text: async () => htmlSample };
      }),
    );

    const result = await analyzeRequest({
      platform: "naver",
      url: "https://blog.naver.com/userid/223456789",
    });
    expect(result.status).toBe(200);
    expect(result.response.data?.aiInsights.status).toBe("ok");
    expect(result.response.data?.aiInsights.summary.length).toBeGreaterThan(0);
    expect(result.response.data?.aiInsights.topActions.length).toBeGreaterThan(0);
    expect(result.response.data?.aiInsights.quickChecklist.length).toBeGreaterThan(0);
  });

  it("Gemini 실패 강제 시 aiInsights.status=degraded + 기본결과 유지", async () => {
    process.env.PSI_API_KEY = "dummy";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const href = input.toString();
        if (href.includes("runPagespeed")) return { ok: true, json: async () => psiPayload() };
        return { ok: true, status: 200, text: async () => htmlSample };
      }),
    );

    const result = await analyzeRequest({
      platform: "naver",
      url: "https://blog.naver.com/userid/223456789?__forceGeminiFail=1",
    });
    expect(result.status).toBe(200);
    expect(result.response.data?.aiInsights.status).toBe("degraded");
    expect(result.response.data?.seo.items.length).toBeGreaterThan(0);
    expect(result.response.partialErrors?.some((e) => e.code === "GEMINI_FAILED")).toBe(true);
  });

  it("YMYL 키워드 샘플 5건 중 4건 이상 감지", () => {
    const samples = [
      "암 예방을 위한 생활 습관",
      "대출한도와 신용등급 관리",
      "고소 절차와 손해배상 정리",
      "복용법과 부작용 안내",
      "일반 여행 후기",
    ];
    const detected = samples.filter((text) => detectYmyl(text).isYmyl);
    expect(detected.length).toBeGreaterThanOrEqual(4);
  });

  it("하드 규칙은 AI 보정으로 상태 변경되지 않는다", async () => {
    process.env.PSI_API_KEY = "dummy";
    process.env.GEMINI_API_KEY = "dummy";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const href = input.toString();
        if (href.includes("runPagespeed")) return { ok: true, json: async () => psiPayload() };
        if (href.includes("generativelanguage.googleapis.com")) {
          return { ok: true, json: async () => geminiPayload() };
        }
        return { ok: true, status: 200, text: async () => htmlSample };
      }),
    );

    const result = await analyzeRequest({
      platform: "naver",
      url: "https://blog.naver.com/userid/223456789",
    });
    const seo01 = result.response.data?.seo.items.find((item) => item.id === "SEO-01");
    expect(seo01?.status).toBe("pass");
  });
});
