import type { RuleItem, RuleStatus } from "@/lib/types";
import type { ParseResult } from "@/lib/parserAdapters";

interface RuleDefinition {
  id: string;
  weight: number;
  evaluate: (parsed: ParseResult) => RuleStatus;
  message: Record<RuleStatus, string>;
}

function hasPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function sentenceUniqueRatio(text: string): number {
  const parts = text
    .split(/[.!?。！？]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return 0;
  const unique = new Set(parts);
  return unique.size / parts.length;
}

function scoreFromStatus(status: RuleStatus): number {
  if (status === "pass") return 1;
  if (status === "warn") return 0.5;
  return 0;
}

function computeDomainResult(parsed: ParseResult, rules: RuleDefinition[]) {
  const makeHighlight = (message: string) => {
    const excerpt = parsed.bodyText.slice(0, 120) || message;
    const startOffset = parsed.bodyText.indexOf(excerpt);
    return {
      type: "paragraph" as const,
      excerpt,
      startOffset: startOffset >= 0 ? startOffset : 0,
      endOffset: (startOffset >= 0 ? startOffset : 0) + excerpt.length,
    };
  };

  const items: RuleItem[] = rules.map((rule) => {
    const status = rule.evaluate(parsed);
    const message = rule.message[status];
    return {
      id: rule.id,
      status,
      message,
      highlights: status === "pass" ? [] : [makeHighlight(message)],
    };
  });

  const totalWeight = rules.reduce((acc, cur) => acc + cur.weight, 0);
  const weighted = rules.reduce((acc, rule, idx) => {
    return acc + rule.weight * scoreFromStatus(items[idx].status);
  }, 0);
  const score = (weighted / totalWeight) * 100;
  const confidence =
    items.filter((item) => item.status !== "fail").length / Math.max(items.length, 1);

  return {
    score: Number(score.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    items,
  };
}

const seoRules: RuleDefinition[] = [
  {
    id: "SEO-01",
    weight: 5,
    evaluate: (p) => (p.title.length > 0 ? "pass" : "fail"),
    message: {
      pass: "title 태그가 존재합니다.",
      warn: "title 태그를 확인해 주세요.",
      fail: "title 태그가 없습니다.",
    },
  },
  {
    id: "SEO-02",
    weight: 4,
    evaluate: (p) => {
      if (p.title.length >= 15 && p.title.length <= 60) return "pass";
      if (p.title.length >= 8) return "warn";
      return "fail";
    },
    message: {
      pass: "title 길이가 적정 범위입니다.",
      warn: "title 길이가 권장 범위에 가깝지 않습니다.",
      fail: "title 길이가 너무 짧습니다.",
    },
  },
  {
    id: "SEO-03",
    weight: 4,
    evaluate: () => "warn",
    message: {
      pass: "meta description이 존재합니다.",
      warn: "meta description은 현재 파서 범위 밖이라 경고로 처리됩니다.",
      fail: "meta description이 없습니다.",
    },
  },
  {
    id: "SEO-04",
    weight: 3,
    evaluate: () => "warn",
    message: {
      pass: "meta description 길이가 적정합니다.",
      warn: "meta description 길이는 현재 제한적으로만 검사됩니다.",
      fail: "meta description 길이가 부적절합니다.",
    },
  },
  {
    id: "SEO-05",
    weight: 2,
    evaluate: () => "warn",
    message: {
      pass: "canonical 링크가 확인됩니다.",
      warn: "canonical 링크는 현재 파서 범위 밖이라 경고로 처리됩니다.",
      fail: "canonical 링크가 없습니다.",
    },
  },
  {
    id: "SEO-06",
    weight: 5,
    evaluate: (p) => (p.metrics.h1Count === 1 ? "pass" : p.metrics.h1Count === 0 ? "fail" : "warn"),
    message: {
      pass: "h1 개수가 적정합니다.",
      warn: "h1 개수가 권장값(1개)과 다릅니다.",
      fail: "h1 태그가 없습니다.",
    },
  },
  {
    id: "SEO-07",
    weight: 4,
    evaluate: (p) => (p.metrics.h2Count + p.metrics.h3Count > 0 ? "pass" : "warn"),
    message: {
      pass: "h2/h3 구조가 존재합니다.",
      warn: "h2/h3 구조 보강이 필요합니다.",
      fail: "h2/h3 구조가 없습니다.",
    },
  },
  {
    id: "SEO-08",
    weight: 4,
    evaluate: (p) => (p.metrics.titleKeywordInBodyTop ? "pass" : "warn"),
    message: {
      pass: "제목-본문 키워드 정합성이 양호합니다.",
      warn: "제목 키워드가 본문 상단에 약하게 노출됩니다.",
      fail: "제목-본문 키워드 정합성이 낮습니다.",
    },
  },
  {
    id: "SEO-09",
    weight: 3,
    evaluate: (p) => {
      if (p.bodyText.length >= 300) return "pass";
      if (p.bodyText.length >= 150) return "warn";
      return "fail";
    },
    message: {
      pass: "본문 길이가 충분합니다.",
      warn: "본문 길이가 다소 짧습니다.",
      fail: "본문 길이가 부족합니다.",
    },
  },
  {
    id: "SEO-10",
    weight: 3,
    evaluate: (p) =>
      p.metrics.avgSentenceLength <= 90 ? "pass" : p.metrics.avgSentenceLength <= 130 ? "warn" : "fail",
    message: {
      pass: "장문단/장문장 비율이 양호합니다.",
      warn: "장문장 비율이 다소 높습니다.",
      fail: "장문장 비율이 높아 가독성이 낮습니다.",
    },
  },
  {
    id: "SEO-11",
    weight: 5,
    evaluate: () => "warn",
    message: {
      pass: "이미지 alt 누락률이 낮습니다.",
      warn: "이미지 alt는 현재 상세 파싱 범위 밖이라 경고 처리됩니다.",
      fail: "이미지 alt 누락률이 높습니다.",
    },
  },
  {
    id: "SEO-12",
    weight: 2,
    evaluate: (p) => (p.metrics.listItemCount >= 1 ? "pass" : "warn"),
    message: {
      pass: "본문 구조 대비 이미지/목록 균형이 양호합니다.",
      warn: "본문 구조 보조 요소가 부족합니다.",
      fail: "본문 구조 보조 요소가 거의 없습니다.",
    },
  },
  {
    id: "SEO-13",
    weight: 3,
    evaluate: (p) => (p.metrics.externalLinkCount >= 1 ? "pass" : "warn"),
    message: {
      pass: "링크 구성이 확인됩니다.",
      warn: "링크 구성이 부족합니다.",
      fail: "링크가 없습니다.",
    },
  },
  {
    id: "SEO-14",
    weight: 2,
    evaluate: (p) => (p.metrics.externalLinkCount >= 2 ? "pass" : p.metrics.externalLinkCount === 1 ? "warn" : "fail"),
    message: {
      pass: "외부 링크 품질 신호가 충분합니다.",
      warn: "외부 링크가 적어 품질 판단 신호가 부족합니다.",
      fail: "외부 링크가 없습니다.",
    },
  },
  {
    id: "SEO-15",
    weight: 2,
    evaluate: () => "warn",
    message: {
      pass: "앵커 텍스트 품질이 양호합니다.",
      warn: "앵커 텍스트 품질은 현재 제한적으로만 검사됩니다.",
      fail: "모호한 앵커 텍스트 비율이 높습니다.",
    },
  },
  {
    id: "SEO-16",
    weight: 2,
    evaluate: () => "warn",
    message: {
      pass: "URL 정규성이 양호합니다.",
      warn: "URL 정규성은 기본 검증만 적용되어 경고 처리됩니다.",
      fail: "URL 정규성이 낮습니다.",
    },
  },
  {
    id: "SEO-17",
    weight: 3,
    evaluate: () => "warn",
    message: {
      pass: "중복 메타 신호가 낮습니다.",
      warn: "중복 메타는 단일 URL 분석이라 경고 처리됩니다.",
      fail: "중복 메타 가능성이 높습니다.",
    },
  },
  {
    id: "SEO-18",
    weight: 2,
    evaluate: () => "warn",
    message: {
      pass: "OG 태그가 일부 확인됩니다.",
      warn: "OG 태그는 현재 파서 범위 밖이라 경고 처리됩니다.",
      fail: "OG 태그가 없습니다.",
    },
  },
  {
    id: "SEO-19",
    weight: 1,
    evaluate: () => "warn",
    message: {
      pass: "로케일/인코딩 일관성이 확인됩니다.",
      warn: "로케일/인코딩은 현재 제한적으로만 검사됩니다.",
      fail: "로케일/인코딩 불일치 가능성이 있습니다.",
    },
  },
  {
    id: "SEO-20",
    weight: 4,
    evaluate: () => "warn",
    message: {
      pass: "색인 방해 요소가 감지되지 않습니다.",
      warn: "noindex 등 차단 신호는 현재 제한적으로만 검사됩니다.",
      fail: "색인 방해 요소가 감지되었습니다.",
    },
  },
];

export const HARD_RULE_IDS = new Set<string>(["SEO-01", "SEO-02", "SEO-06", "SEO-07", "SEO-09", "SEO-13"]);

export const SEO_RULE_WEIGHTS: Record<string, number> = Object.fromEntries(
  seoRules.map((r) => [r.id, r.weight]),
);

export const AEO_RULE_WEIGHTS: Record<string, number> = {};

export const GEO_RULE_WEIGHTS: Record<string, number> = {};

const aeoRules: RuleDefinition[] = [
  {
    id: "AEO-01",
    weight: 5,
    evaluate: (p) =>
      p.headings.length === 0
        ? "fail"
        : p.metrics.questionHeadingCount / p.headings.length >= 0.2
          ? "pass"
          : "warn",
    message: {
      pass: "질문형 소제목 비율이 충분합니다.",
      warn: "질문형 소제목 비율을 보강해 주세요.",
      fail: "소제목이 없어 질문형 구조를 판단할 수 없습니다.",
    },
  },
  {
    id: "AEO-02",
    weight: 5,
    evaluate: (p) => (p.metrics.introHasSummary ? "pass" : "fail"),
    message: {
      pass: "도입부 요약 문장이 존재합니다.",
      warn: "도입부 요약 문장을 보완해 주세요.",
      fail: "도입부 요약 문장이 부족합니다.",
    },
  },
  {
    id: "AEO-03",
    weight: 4,
    evaluate: (p) => (p.metrics.introHasSummary ? "pass" : "warn"),
    message: {
      pass: "핵심 답변이 도입부에 배치되어 있습니다.",
      warn: "핵심 답변 선배치가 약합니다.",
      fail: "핵심 답변 선배치가 부족합니다.",
    },
  },
  {
    id: "AEO-04",
    weight: 3,
    evaluate: (p) =>
      p.metrics.avgSentenceLength <= 85 ? "pass" : p.metrics.avgSentenceLength <= 120 ? "warn" : "fail",
    message: {
      pass: "문단 길이 적정성이 양호합니다.",
      warn: "문단 길이가 다소 길어 보입니다.",
      fail: "문단 길이가 과도하게 깁니다.",
    },
  },
  {
    id: "AEO-05",
    weight: 3,
    evaluate: (p) => (p.metrics.listItemCount >= 5 ? "pass" : p.metrics.listItemCount >= 2 ? "warn" : "fail"),
    message: {
      pass: "목록 구조가 충분히 활용되었습니다.",
      warn: "목록 구조를 보강하면 좋습니다.",
      fail: "목록 구조가 부족합니다.",
    },
  },
  {
    id: "AEO-06",
    weight: 3,
    evaluate: (p) =>
      hasPattern(p.bodyText, /(첫째|둘째|셋째|1\.|2\.|3\.)/) ? "pass" : "warn",
    message: {
      pass: "단계형 설명 패턴이 확인됩니다.",
      warn: "단계형 설명 패턴을 보강해 주세요.",
      fail: "단계형 설명이 없습니다.",
    },
  },
  {
    id: "AEO-07",
    weight: 4,
    evaluate: (p) => (hasPattern(p.bodyText, /(FAQ|Q\/A|질문|답변)/i) ? "pass" : "warn"),
    message: {
      pass: "FAQ/QA 패턴이 확인됩니다.",
      warn: "FAQ/QA 구조를 보강하면 좋습니다.",
      fail: "FAQ/QA 구조가 없습니다.",
    },
  },
  {
    id: "AEO-08",
    weight: 4,
    evaluate: (p) => {
      const density = (p.metrics.h2Count + p.metrics.h3Count) / Math.max(p.bodyText.length / 800, 1);
      if (density >= 1) return "pass";
      if (density >= 0.5) return "warn";
      return "fail";
    },
    message: {
      pass: "소제목 밀도가 적정합니다.",
      warn: "소제목 밀도가 부족합니다.",
      fail: "소제목 밀도가 매우 낮습니다.",
    },
  },
  {
    id: "AEO-09",
    weight: 2,
    evaluate: (p) => (hasPattern(p.bodyText, /(비교|장단점|표|vs)/i) ? "pass" : "warn"),
    message: {
      pass: "비교/표 구조 신호가 확인됩니다.",
      warn: "비교/표 구조를 보강하면 좋습니다.",
      fail: "비교/표 구조가 부족합니다.",
    },
  },
  {
    id: "AEO-10",
    weight: 3,
    evaluate: (p) => {
      const ratio = sentenceUniqueRatio(p.bodyText);
      if (ratio >= 0.85) return "pass";
      if (ratio >= 0.7) return "warn";
      return "fail";
    },
    message: {
      pass: "중복 문장률이 낮습니다.",
      warn: "중복 문장 가능성이 있습니다.",
      fail: "중복 문장률이 높습니다.",
    },
  },
  {
    id: "AEO-11",
    weight: 2,
    evaluate: (p) =>
      p.metrics.avgSentenceLength >= 20 && p.metrics.avgSentenceLength <= 90 ? "pass" : "warn",
    message: {
      pass: "문장 길이 균형이 양호합니다.",
      warn: "문장 길이 균형이 좋지 않습니다.",
      fail: "문장 길이 편차가 큽니다.",
    },
  },
  {
    id: "AEO-12",
    weight: 2,
    evaluate: (p) => (hasPattern(p.bodyText, /(목차|바로가기|섹션)/) ? "pass" : "warn"),
    message: {
      pass: "문서 내 네비게이션 신호가 있습니다.",
      warn: "문서 내 네비게이션 신호를 보강하면 좋습니다.",
      fail: "문서 내 네비게이션 신호가 부족합니다.",
    },
  },
  {
    id: "AEO-13",
    weight: 4,
    evaluate: (p) => (p.metrics.titleKeywordInBodyTop ? "pass" : "warn"),
    message: {
      pass: "의도 일치 키워드가 초반에 배치되어 있습니다.",
      warn: "의도 일치 키워드를 초반 문단에 보강해 주세요.",
      fail: "의도 일치 키워드가 부족합니다.",
    },
  },
  {
    id: "AEO-14",
    weight: 2,
    evaluate: (p) => (hasPattern(p.bodyText, /(정리|다음 단계|체크리스트)/) ? "pass" : "warn"),
    message: {
      pass: "행동 유도/다음 단계 섹션이 있습니다.",
      warn: "행동 유도/다음 단계 섹션을 보강하면 좋습니다.",
      fail: "행동 유도/다음 단계 섹션이 없습니다.",
    },
  },
  {
    id: "AEO-15",
    weight: 4,
    evaluate: (p) => (hasPattern(p.bodyText, /(수정일|업데이트|버전|20\d{2})/) ? "pass" : "warn"),
    message: {
      pass: "최신성 신호가 확인됩니다.",
      warn: "최신성 신호를 보강해 주세요.",
      fail: "최신성 신호가 없습니다.",
    },
  },
];

Object.assign(AEO_RULE_WEIGHTS, Object.fromEntries(aeoRules.map((r) => [r.id, r.weight])));

const geoRules: RuleDefinition[] = [
  {
    id: "GEO-01",
    weight: 3,
    evaluate: (p) => (p.metrics.externalLinkCount >= 1 ? "pass" : "warn"),
    message: {
      pass: "출처 링크가 포함되어 있습니다.",
      warn: "출처 링크 보강이 필요합니다.",
      fail: "출처 링크가 없습니다.",
    },
  },
  {
    id: "GEO-02",
    weight: 3,
    evaluate: (p) => (p.metrics.sentenceCount >= 5 ? "pass" : "warn"),
    message: {
      pass: "주장 전개를 판단할 문장 수가 충분합니다.",
      warn: "문장 수가 적어 주장 명확성 판단 신뢰도가 낮습니다.",
      fail: "문장 수가 너무 적습니다.",
    },
  },
  {
    id: "GEO-03",
    weight: 4,
    evaluate: (p) => (p.metrics.titleKeywordInBodyTop ? "pass" : "warn"),
    message: {
      pass: "제목-본문 정합성이 양호합니다.",
      warn: "제목 키워드가 본문 상단에 충분히 드러나지 않습니다.",
      fail: "제목-본문 정합성이 낮습니다.",
    },
  },
];

Object.assign(GEO_RULE_WEIGHTS, Object.fromEntries(geoRules.map((r) => [r.id, r.weight])));

export function runRulesEngine(parsed: ParseResult) {
  return {
    seo: computeDomainResult(parsed, seoRules),
    aeo: computeDomainResult(parsed, aeoRules),
    geo: computeDomainResult(parsed, geoRules),
  };
}
