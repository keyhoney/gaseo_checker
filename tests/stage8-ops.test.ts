import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analyze/route";
import { __resetOpsMonitorForTest, getOpsSnapshot } from "@/lib/opsMonitor";
import { __resetRateLimitForTest, getRateLimitConfig } from "@/lib/rateLimit";

const htmlSample = `
<html>
  <head><title>테스트 글 제목 충분히 길게</title></head>
  <body>
    <div class="se-main-container">
      <h1>테스트 글</h1><h2>소제목</h2>
      <p>요약 문장입니다. 본문 길이를 늘리기 위한 설명 문장입니다. 설명 문장입니다. 설명 문장입니다.</p>
      <a href="https://example.com">출처</a>
    </div>
  </body>
</html>
`;

function psiPayload() {
  return {
    lighthouseResult: {
      audits: {
        "largest-contentful-paint": { numericValue: 2200 },
        "interaction-to-next-paint": { numericValue: 180 },
        "cumulative-layout-shift": { numericValue: 0.06 },
      },
    },
    loadingExperience: { metrics: {} },
  };
}

function geminiPayload() {
  return {
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
  };
}

describe("8단계 운영 안정화", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetRateLimitForTest();
    __resetOpsMonitorForTest();
    delete process.env.PSI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it("성공/부분성공/실패 응답 계약을 만족한다", async () => {
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

    const successReq = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.1" },
      body: JSON.stringify({
        platform: "naver",
        url: "https://blog.naver.com/user/1",
      }),
    });
    const successRes = await POST(successReq);
    const successJson = await successRes.json();
    expect(successRes.status).toBe(200);
    expect(successJson.error).toBeNull();
    expect(successJson.data.status).toBe("success_ok");

    const degradedReq = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.2" },
      body: JSON.stringify({
        platform: "naver",
        url: "https://blog.naver.com/user/1?__forcePsiFail=1",
      }),
    });
    const degradedRes = await POST(degradedReq);
    const degradedJson = await degradedRes.json();
    expect(degradedRes.status).toBe(200);
    expect(degradedJson.data.status).toBe("success_degraded");
    expect(Array.isArray(degradedJson.partialErrors)).toBe(true);

    const failReq = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.3" },
      body: JSON.stringify({
        platform: "naver",
        url: "not-a-url",
      }),
    });
    const failRes = await POST(failReq);
    const failJson = await failRes.json();
    expect(failRes.status).toBe(400);
    expect(failJson.error.code).toBe("INVALID_URL");
  });

  it("요청 과다 시 RATE_LIMITED + policyStop + retry-after", async () => {
    const cfg = getRateLimitConfig();
    const req = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.2" },
      body: JSON.stringify({ platform: "naver", url: "not-a-url" }),
    });
    let limited: Response | null = null;
    for (let i = 0; i < cfg.maxRequestsPerWindow + 2; i += 1) {
      const res = await POST(req);
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    const json = await limited!.json();
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(json.error.policyStop).toBe(true);
    expect(limited!.headers.get("retry-after")).toBeTruthy();
  });

  it("ops 메트릭이 집계된다(parseFailureRate/fallbackDepthAvg)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "<html><body><div>tiny</div></body></html>" })),
    );
    const req = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "3.3.3.3" },
      body: JSON.stringify({ platform: "naver", url: "https://blog.naver.com/user/1" }),
    });
    await POST(req);
    const snapshot = getOpsSnapshot("naver");
    expect(snapshot.total).toBeGreaterThan(0);
    expect(snapshot.parseFailureRate).toBeGreaterThanOrEqual(0);
    expect(snapshot.fallbackDepthAvg).toBeGreaterThanOrEqual(0);
    expect(snapshot.alerts).toBeTruthy();
  });
});
