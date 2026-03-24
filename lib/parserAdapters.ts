import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Platform } from "@/lib/types";

interface ParseSelectorResult {
  selector: string;
  depth: number;
  text: string;
  score: number;
  paragraphCount: number;
  headingCount: number;
  listCount: number;
  externalLinkCount: number;
}

export interface ParseResult {
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
}

const SELECTOR_MAP: Record<Platform, string[]> = {
  naver: [
    "div.se-main-container",
    "div#postViewArea",
    "div#postArea",
    "div.se_component_wrap",
    "div.se-section",
    "div[id*='SE']",
    "div[class*='se-']",
    "div.post_ct",
    "article",
  ],
  tistory: [
    "div.tt_article_useless_p_margin",
    "div.entry-content",
    "div.article-view",
    "article",
    "div#content",
    "div[id*='content']",
  ],
  blogspot: ["div.post-body", "article.post", "div.post", "main", "article", "div[id*='post']"],
};

const PARSER_VERSION: Record<Platform, string> = {
  naver: "naver-v1",
  tistory: "tistory-v1",
  blogspot: "blogspot-v1",
};

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function countPromoKeywords(text: string): number {
  const keywords = [
    "이 글이 도움",
    "추천 글",
    "다른 글",
    "인기글",
    "관련 글",
    "바로가기",
    "구독",
    "이웃추가",
    "광고",
    "스폰서",
    "파트너스",
    "블로그 글쓰기",
    "공지 목록",
    "공지글",
    "이웃추가",
    "본문 기타 기능",
    "URL 복사",
    "글 목록",
    "카테고리 글",
    "공유하기",
  ];
  const lower = text.toLowerCase();
  return keywords.reduce((acc, keyword) => {
    return acc + (lower.includes(keyword.toLowerCase()) ? 1 : 0);
  }, 0);
}

function scoreNode(
  node: cheerio.Cheerio<AnyNode>,
  selector: string,
  depth: number,
): ParseSelectorResult | null {
  const cloned = node.clone();
  cloned
    .find(
      "script,style,noscript,iframe,nav,aside,footer,header,.comment,.ads,.widget,.share,.related,.recommend,.promotion,.banner,.subscribe,.sidebar",
    )
    .remove();

  const text = cleanText(cloned.text());
  if (text.length < 30) return null;

  const paragraphCount = cloned.find("p").length;
  const headingCount = cloned.find("h1,h2,h3").length;
  const listCount = cloned.find("li").length;
  const externalLinkCount = cloned.find("a[href^='http://'],a[href^='https://']").length;
  const promoHits = countPromoKeywords(text);
  const linkDensity = externalLinkCount / Math.max(1, paragraphCount + headingCount + listCount);
  const score =
    text.length +
    paragraphCount * 60 +
    headingCount * 45 +
    listCount * 12 -
    externalLinkCount * 18 -
    Math.floor(linkDensity * 70) -
    promoHits * 110;

  return {
    selector,
    depth,
    text,
    score,
    paragraphCount,
    headingCount,
    listCount,
    externalLinkCount,
  };
}

function extractBySelectors($: cheerio.CheerioAPI, selectors: string[]): ParseSelectorResult | null {
  let best: ParseSelectorResult | null = null;
  for (let i = 0; i < selectors.length; i += 1) {
    const selector = selectors[i];
    const nodes = $(selector).toArray();
    if (nodes.length === 0) continue;
    for (const el of nodes) {
      const candidate = scoreNode($(el), selector, i + 1);
      if (!candidate) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }
  }
  return best;
}

function extractByGlobalFallback($: cheerio.CheerioAPI): ParseSelectorResult | null {
  const candidates = [
    "article",
    "main",
    "div[id*='content']",
    "div[class*='content']",
    "div[id*='post']",
    "div[class*='post']",
    "section",
    "body",
  ];
  let best: ParseSelectorResult | null = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const selector = candidates[i];
    const nodes = $(selector).toArray();
    if (nodes.length === 0) continue;
    for (const el of nodes) {
      const base = scoreNode($(el), `fallback:${selector}`, 90 + i);
      if (!base) continue;
      const candidate = { ...base, selector: `fallback:${selector}` };
      if (!best || candidate.score > best.score) best = candidate;
    }
  }

  return best;
}

export function parseBlogHtml(platform: Platform, html: string): ParseResult | null {
  const $ = cheerio.load(html);
  const title = cleanText($("title").first().text());
  const headings = $("h1,h2,h3")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);

  let noiseBlocksRemoved = 0;
  const rawNodeCountBefore = $("script,style,noscript,iframe,nav,aside,footer,.comment,.ads,.widget,.share").length;
  const selected = extractBySelectors($, SELECTOR_MAP[platform]) ?? extractByGlobalFallback($);
  if (!selected) {
    return null;
  }
  noiseBlocksRemoved = rawNodeCountBefore;

  const titleKeyword = cleanText(title).split(/\s+/).find((v) => v.length >= 2) ?? "";
  const bodyTop = selected.text.slice(0, Math.max(1, Math.floor(selected.text.length * 0.3)));
  const sentenceParts = selected.text.split(/[.!?。！？]/).map((s) => cleanText(s)).filter(Boolean);
  const sentenceCount = sentenceParts.length;
  const avgSentenceLength =
    sentenceCount > 0
      ? sentenceParts.reduce((acc, cur) => acc + cur.length, 0) / sentenceCount
      : 0;
  const introText = selected.text.slice(0, 400);
  const introHasSummary = /(요약|정리|결론|핵심|한줄|한 줄)/.test(introText);

  return {
    title,
    bodyText: selected.text,
    headings,
    parserMeta: {
      parserVersion: PARSER_VERSION[platform],
      contentSelectorUsed: selected.selector,
      fallbackDepth: selected.depth,
      noiseBlocksRemoved,
    },
    metrics: {
      h1Count: $("h1").length,
      h2Count: $("h2").length,
      h3Count: $("h3").length,
      paragraphCount: $("p").length,
      listItemCount: $("li").length,
      externalLinkCount: $("a[href^='http://'],a[href^='https://']").length,
      sentenceCount,
      avgSentenceLength,
      introHasSummary,
      titleKeywordInBodyTop: titleKeyword ? bodyTop.includes(titleKeyword) : false,
      questionHeadingCount: headings.filter((h) => /\?|무엇|왜|어떻게|방법/.test(h)).length,
    },
  };
}
