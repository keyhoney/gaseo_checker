import { describe, expect, it } from "vitest";
import { nextAnalyzeState } from "@/lib/analyzeMachine";
import { validateAnalyzeInput } from "@/lib/urlValidation";

describe("1단계 URL 검증 - 성공 3건", () => {
  it("naver URL 검증 성공", () => {
    const result = validateAnalyzeInput({
      platform: "naver",
      url: "https://blog.naver.com/userid/223456789",
    });
    expect(result.ok).toBe(true);
  });

  it("tistory URL 검증 성공", () => {
    const result = validateAnalyzeInput({
      platform: "tistory",
      url: "https://myblog.tistory.com/entry/sample-post/",
    });
    expect(result.ok).toBe(true);
  });

  it("blogspot URL 검증 성공", () => {
    const result = validateAnalyzeInput({
      platform: "blogspot",
      url: "http://sample.blogspot.com/2026/03/example.html",
    });
    expect(result.ok).toBe(true);
  });
});

describe("1단계 URL 검증 - 실패 4건", () => {
  it("잘못된 URL 형식 -> INVALID_URL", () => {
    const result = validateAnalyzeInput({
      platform: "naver",
      url: "not-a-url",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URL");
  });

  it("플랫폼 불일치 -> PLATFORM_MISMATCH", () => {
    const result = validateAnalyzeInput({
      platform: "tistory",
      url: "https://blog.naver.com/userid/223456789",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PLATFORM_MISMATCH");
  });

  it("미지원 도메인 -> PLATFORM_MISMATCH", () => {
    const result = validateAnalyzeInput({
      platform: "blogspot",
      url: "https://example.com/post/1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PLATFORM_MISMATCH");
  });

  it("빈 입력 -> INVALID_URL", () => {
    const result = validateAnalyzeInput({
      platform: "naver",
      url: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_URL");
  });
});

describe("1단계 상태머신", () => {
  it("SUBMIT_URL -> validating -> analyzing 흐름", () => {
    const step1 = nextAnalyzeState("idle", "SUBMIT_URL");
    const step2 = nextAnalyzeState(step1, "VALIDATION_PASS");
    expect(step1).toBe("validating");
    expect(step2).toBe("analyzing");
  });

  it("검증 실패 시 error_failed 이동", () => {
    const step1 = nextAnalyzeState("idle", "SUBMIT_URL");
    const step2 = nextAnalyzeState(step1, "VALIDATION_FAIL");
    expect(step2).toBe("error_failed");
  });
});
