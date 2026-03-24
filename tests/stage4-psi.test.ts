import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRequest } from "@/lib/analyzeService";

const htmlSample = `
<html>
  <head><title>네이버 블로그 SEO 최적화 방법 정리</title></head>
  <body>
    <div class="se-main-container">
      <h1>네이버 블로그 SEO 최적화 방법</h1>
      <h2>왜 SEO가 중요한가?</h2>
      <p>요약: 핵심을 먼저 설명합니다. 본문 길이 확보를 위해 문장을 충분히 작성합니다. 추가 설명 문장입니다. 추가 설명 문장입니다.</p>
      <a href="https://example.com/source">출처</a>
    </div>
  </body>
</html>
`;

function psiPayload(lcpMs: number, inpMs: number, cls: number) {
  return {
    lighthouseResult: {
      audits: {
        "largest-contentful-paint": { numericValue: lcpMs },
        "interaction-to-next-paint": { numericValue: inpMs },
        "cumulative-layout-shift": { numericValue: cls },
      },
    },
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2600 },
        INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8 },
      },
    },
  };
}

describe("4단계 PSI/CWV", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PSI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("3회 측정 중앙값으로 lab/field 값을 계산한다", async () => {
    process.env.PSI_API_KEY = "dummy";
    process.env.GEMINI_API_KEY = "dummy";
    let psiCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const href = input.toString();
        if (href.includes("runPagespeed")) {
          psiCallCount += 1;
          if (psiCallCount === 1) {
            return { ok: true, json: async () => psiPayload(2100, 250, 0.12) };
          }
          if (psiCallCount === 2) {
            return { ok: true, json: async () => psiPayload(3000, 180, 0.05) };
          }
          return { ok: true, json: async () => psiPayload(2500, 320, 0.09) };
        }
        if (href.includes("generativelanguage.googleapis.com")) {
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          summary: ["요약"],
                          topActions: [],
                          quickChecklist: [],
                          assumptions: [],
                          overallConfidence: 0.8,
                          scoreAdjustments: [],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => htmlSample,
        };
      }),
    );

    const result = await analyzeRequest({
      platform: "naver",
      url: "https://blog.naver.com/userid/223456789",
    });

    expect(result.status).toBe(200);
    expect(result.response.error).toBeNull();
    expect(result.response.data?.status).toBe("success_ok");
    expect(result.response.data?.webVitals.measurementPolicy.runs).toBe(3);
    expect(result.response.data?.webVitals.measurementPolicy.aggregation).toBe("median");
    expect(result.response.data?.webVitals.lab.lcp?.value).toBe(2.5);
    expect(result.response.data?.webVitals.lab.inp?.value).toBe(250);
    expect(result.response.data?.webVitals.lab.inp?.note).toBe("lab");
    expect(result.response.data?.webVitals.lab.cls?.value).toBe(0.09);
    expect(result.response.data?.webVitals.field.lcp?.value).toBe(2600);
    expect(result.response.data?.webVitals.field.inp?.value).toBe(180);
    expect(result.response.data?.webVitals.field.cls?.value).toBe(0.08);
  });

  it("PSI 실패 강제 시 200 + success_degraded + partialErrors를 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const href = input.toString();
        if (href.includes("generativelanguage.googleapis.com")) {
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          summary: ["요약"],
                          topActions: [],
                          quickChecklist: [],
                          assumptions: [],
                          overallConfidence: 0.8,
                          scoreAdjustments: [],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => htmlSample,
        };
      }),
    );

    const result = await analyzeRequest({
      platform: "naver",
      url: "https://blog.naver.com/userid/223456789?__forcePsiFail=1",
    });

    expect(result.status).toBe(200);
    expect(result.response.error).toBeNull();
    expect(result.response.data?.status).toBe("success_degraded");
    expect(result.response.partialErrors?.[0]?.code).toBe("PSI_FAILED");
    expect(result.response.data?.webVitals.lab.lcp).toBeNull();
    expect(result.response.data?.webVitals.lab.inp).toBeNull();
    expect(result.response.data?.webVitals.field.cls).toBeNull();
  });
});
