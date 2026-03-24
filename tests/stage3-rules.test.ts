import { describe, expect, it } from "vitest";
import { parseBlogHtml } from "@/lib/parserAdapters";
import { AEO_RULE_WEIGHTS, GEO_RULE_WEIGHTS, SEO_RULE_WEIGHTS, runRulesEngine } from "@/lib/rulesEngine";
import type { ParseResult } from "@/lib/parserAdapters";

const richHtml = `
<html>
  <head><title>네이버 블로그 SEO 최적화 방법 정리</title></head>
  <body>
    <div class="se-main-container">
      <h1>네이버 블로그 SEO 최적화 방법</h1>
      <h2>왜 SEO가 중요한가?</h2>
      <h2>어떻게 적용하나요?</h2>
      <p>요약: 이 글은 블로그 검색 노출을 높이기 위한 핵심 절차를 정리합니다.</p>
      <p>첫째, 제목과 본문의 핵심 키워드 정합성을 맞춥니다.</p>
      <p>둘째, 문단을 짧게 나누고 소제목을 촘촘히 배치합니다.</p>
      <p>셋째, 출처를 링크로 명확히 남깁니다.</p>
      <ul><li>체크 1</li><li>체크 2</li><li>체크 3</li><li>체크 4</li><li>체크 5</li></ul>
      <a href="https://developers.google.com/search">참고 문서</a>
      <p>결론: 네이버 블로그 SEO 최적화 방법은 구조화와 근거 제시가 핵심입니다.</p>
      <p>추가 설명 문장을 넣어 총 문장 수와 본문 길이를 확보합니다. 추가 문장을 더 작성합니다. 추가 문장을 더 작성합니다. 추가 문장을 더 작성합니다. 추가 문장을 더 작성합니다. 추가 문장을 더 작성합니다.</p>
    </div>
  </body>
</html>
`;

const poorHtml = `
<html>
  <head><title>짧은글</title></head>
  <body>
    <div class="se-main-container">
      <h1>제목</h1>
      <p>아주 짧은 본문입니다. 요약 문구도 없고 링크도 없습니다. 문장 수가 적어서 규칙 다수에서 낮은 평가를 받아야 합니다.</p>
    </div>
  </body>
</html>
`;

describe("3단계 규칙 엔진 결과 구조", () => {
  it("/api 응답용 seo/aeo/geo 구조가 채워진다", () => {
    const parsed = parseBlogHtml("naver", richHtml);
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    const result = runRulesEngine(parsed);
    expect(result.seo.score).toBeTypeOf("number");
    expect(result.aeo.score).toBeTypeOf("number");
    expect(result.geo.score).toBeTypeOf("number");
    expect(result.seo.items.length).toBeGreaterThan(0);
    expect(result.aeo.items.length).toBeGreaterThan(0);
    expect(result.geo.items.length).toBeGreaterThan(0);
    expect(result.seo.items.length).toBe(20);
    expect(result.aeo.items.length).toBe(15);
  });
});

describe("3단계 규칙 샘플 10개 상태 검증", () => {
  const highQualityParsed: ParseResult = {
    title: "네이버 블로그 SEO 최적화 방법 정리",
    bodyText:
      "네이버 블로그 SEO 최적화 방법을 요약합니다. 결론과 핵심을 먼저 제시합니다. 출처를 포함하고 소제목 구조를 유지합니다. 문장을 충분히 작성하여 신뢰성을 높입니다. 추가 설명을 통해 내용을 풍부하게 만듭니다. 마지막으로 다시 네이버 블로그 SEO 최적화 방법을 정리합니다. 실전 적용 팁을 더 적습니다. 단계별 체크리스트를 제시합니다. 품질 향상 사례를 덧붙입니다. 유지보수 방법을 설명합니다. 측정 기준을 정리합니다. 반복 문장으로 길이를 확보합니다. 반복 문장으로 길이를 확보합니다. 반복 문장으로 길이를 확보합니다. 반복 문장으로 길이를 확보합니다.",
    headings: ["왜 SEO가 중요한가?", "어떻게 적용하나요?"],
    parserMeta: {
      parserVersion: "naver-v1",
      contentSelectorUsed: "div.se-main-container",
      fallbackDepth: 1,
      noiseBlocksRemoved: 0,
    },
    metrics: {
      h1Count: 1,
      h2Count: 2,
      h3Count: 0,
      paragraphCount: 6,
      listItemCount: 5,
      externalLinkCount: 2,
      sentenceCount: 6,
      avgSentenceLength: 35,
      introHasSummary: true,
      titleKeywordInBodyTop: true,
      questionHeadingCount: 2,
    },
  };

  const lowQualityParsed: ParseResult = {
    title: "짧은글",
    bodyText: "짧다.",
    headings: [],
    parserMeta: {
      parserVersion: "naver-v1",
      contentSelectorUsed: "div.se-main-container",
      fallbackDepth: 1,
      noiseBlocksRemoved: 0,
    },
    metrics: {
      h1Count: 1,
      h2Count: 0,
      h3Count: 0,
      paragraphCount: 1,
      listItemCount: 0,
      externalLinkCount: 0,
      sentenceCount: 1,
      avgSentenceLength: 2,
      introHasSummary: false,
      titleKeywordInBodyTop: false,
      questionHeadingCount: 0,
    },
  };

  it("richHtml 기대 상태와 일치", () => {
    const result = runRulesEngine(highQualityParsed);
    const map = new Map(
      [...result.seo.items, ...result.aeo.items, ...result.geo.items].map((i) => [i.id, i.status]),
    );

    const expected: Array<[string, "pass" | "warn" | "fail"]> = [
      ["SEO-01", "pass"],
      ["SEO-02", "pass"],
      ["SEO-06", "pass"],
      ["SEO-07", "pass"],
      ["SEO-09", "pass"],
      ["AEO-01", "pass"],
      ["AEO-02", "pass"],
      ["AEO-08", "pass"],
      ["GEO-01", "pass"],
      ["GEO-03", "pass"],
    ];

    for (const [id, status] of expected) {
      expect(map.get(id)).toBe(status);
    }
  });

  it("poorHtml에서 다수 fail/warn 재현", () => {
    const result = runRulesEngine(lowQualityParsed);
    const map = new Map(
      [...result.seo.items, ...result.aeo.items, ...result.geo.items].map((i) => [i.id, i.status]),
    );
    expect(map.get("SEO-02")).toBe("fail");
    expect(map.get("SEO-09")).toBe("fail");
    expect(map.get("AEO-02")).toBe("fail");
  });
});

describe("3단계 점수 산식 검증(±0.1)", () => {
  it("DomainScore 산식과 계산 결과 오차 ±0.1 이내", () => {
    const parsed: ParseResult = {
      title: "품질 좋은 글 제목 작성 가이드 완전판",
      bodyText:
        "요약 문장을 포함한 충분한 본문입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다. 추가 설명 문장입니다.",
      headings: ["왜 중요한가?", "어떻게 하는가?"],
      parserMeta: {
        parserVersion: "naver-v1",
        contentSelectorUsed: "div.se-main-container",
        fallbackDepth: 1,
        noiseBlocksRemoved: 0,
      },
      metrics: {
        h1Count: 1,
        h2Count: 2,
        h3Count: 0,
        paragraphCount: 5,
        listItemCount: 5,
        externalLinkCount: 1,
        sentenceCount: 6,
        avgSentenceLength: 28,
        introHasSummary: true,
        titleKeywordInBodyTop: true,
        questionHeadingCount: 2,
      },
    };
    const result = runRulesEngine(parsed);
    const weightMap = SEO_RULE_WEIGHTS;
    const statusScore = (status: "pass" | "warn" | "fail") =>
      status === "pass" ? 1 : status === "warn" ? 0.5 : 0;

    const totalWeight = result.seo.items.reduce((acc, item) => acc + weightMap[item.id], 0);
    const weightedSum = result.seo.items.reduce(
      (acc, item) => acc + weightMap[item.id] * statusScore(item.status),
      0,
    );
    const expectedSeo = Number(((weightedSum / totalWeight) * 100).toFixed(2));
    expect(Math.abs(result.seo.score - expectedSeo)).toBeLessThanOrEqual(0.1);

    const aeoTotalWeight = Object.values(AEO_RULE_WEIGHTS).reduce((a, b) => a + b, 0);
    const geoTotalWeight = Object.values(GEO_RULE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(aeoTotalWeight).toBeGreaterThan(0);
    expect(geoTotalWeight).toBeGreaterThan(0);
  });
});
