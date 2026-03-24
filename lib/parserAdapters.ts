import * as cheerio from "cheerio";
import type { Platform } from "@/lib/types";

interface ParseSelectorResult {
  selector: string;
  depth: number;
  text: string;
  score: number;
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
  naver: ["div.se-main-container", "div#postViewArea", "article", "div[id*='post']"],
  tistory: ["div.tt_article_useless_p_margin", "div.entry-content", "article", "div#content"],
  blogspot: ["div.post-body", "article.post", "div.post", "main"],
};

const PARSER_VERSION: Record<Platform, string> = {
  naver: "naver-v1",
  tistory: "tistory-v1",
  blogspot: "blogspot-v1",
};

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function extractBySelectors($: cheerio.CheerioAPI, selectors: string[]): ParseSelectorResult | null {
  const minTextLength = 30;
  let best: ParseSelectorResult | null = null;
  for (let i = 0; i < selectors.length; i += 1) {
    const selector = selectors[i];
    const node = $(selector).first().clone();
    if (node.length === 0) continue;

    const linkCount = node.find("a").length;
    const blockCount = node.find("p,li,h1,h2,h3").length;
    node.find("script,style,noscript,iframe,nav,aside,footer,.comment,.ads,.widget,.share").remove();
    const text = cleanText(node.text());
    if (text.length < minTextLength) continue;
    const score = text.length + blockCount * 30 - linkCount * 20;
    const candidate: ParseSelectorResult = { selector, depth: i + 1, text, score };
    if (!best || candidate.score > best.score) {
      best = candidate;
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
  const selected = extractBySelectors($, SELECTOR_MAP[platform]);
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
