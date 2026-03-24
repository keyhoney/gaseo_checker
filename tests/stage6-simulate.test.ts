import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/simulate-score/route";
import { nextAnalyzeState } from "@/lib/analyzeMachine";

describe("6단계 simulate-score API", () => {
  it("선택 항목 반영 후 예상 점수 변화를 반환한다", async () => {
    const req = new Request("http://localhost/api/simulate-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "naver",
        url: "https://blog.naver.com/user/1",
        baseScores: { seo: 70, aeo: 60, geo: 55, cwv: 50 },
        selectedActions: [
          { id: "AEO-02", expectedStatus: "pass" },
          { id: "SEO-09", expectedStatus: "pass" },
        ],
      }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.after.total).toBeGreaterThan(json.before.total);
    expect(json.topImpactActions.length).toBe(2);
  });
});

describe("6단계 상태머신 전이", () => {
  it("analyzing -> success_degraded 전이", () => {
    const next = nextAnalyzeState("analyzing", "API_SUCCESS_DEGRADED");
    expect(next).toBe("success_degraded");
  });

  it("success_ok -> simulating -> success_ok 전이", () => {
    const s1 = nextAnalyzeState("success_ok", "SIMULATE_SCORE");
    const s2 = nextAnalyzeState(s1, "SIMULATION_SUCCESS");
    expect(s1).toBe("simulating");
    expect(s2).toBe("success_ok");
  });

  it("success_degraded -> simulating -> success_ok 전이", () => {
    const s1 = nextAnalyzeState("success_degraded", "SIMULATE_SCORE");
    const s2 = nextAnalyzeState(s1, "SIMULATION_SUCCESS");
    expect(s1).toBe("simulating");
    expect(s2).toBe("success_ok");
  });

  it("success_ok -> history_ready 전이", () => {
    const next = nextAnalyzeState("success_ok", "HISTORY_LOADED");
    expect(next).toBe("history_ready");
  });
});
