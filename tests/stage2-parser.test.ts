import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRequest } from "@/lib/analyzeService";
import { parseBlogHtml } from "@/lib/parserAdapters";

describe("2단계 파서 어댑터 - 플랫폼별 샘플 9건", () => {
  const samples = [
    {
      name: "naver #1",
      platform: "naver" as const,
      html: `
        <html><head><title>네이버 글 1</title></head>
        <body><div class="se-main-container"><h1>제목1</h1><h2>소제목A</h2><p>본문 텍스트가 충분히 길어야 파싱됩니다. 이것은 테스트용 문장입니다. 추가 문장을 더 넣습니다.</p></div></body></html>`,
    },
    {
      name: "naver #2",
      platform: "naver" as const,
      html: `
        <html><head><title>네이버 글 2</title></head>
        <body><div id="postViewArea"><h1>제목2</h1><h3>소제목B</h3><p>두 번째 샘플입니다. 충분한 길이의 텍스트를 넣어 fallback 2단계를 확인합니다.</p></div></body></html>`,
    },
    {
      name: "naver #3",
      platform: "naver" as const,
      html: `
        <html><head><title>네이버 글 3</title></head>
        <body><article><h1>제목3</h1><h2>소제목C</h2><p>세 번째 샘플 문장입니다. article 선택자로 본문이 추출되는지 확인합니다.</p></article></body></html>`,
    },
    {
      name: "tistory #1",
      platform: "tistory" as const,
      html: `
        <html><head><title>티스토리 글 1</title></head>
        <body><div class="tt_article_useless_p_margin"><h1>제목1</h1><h2>소제목A</h2><p>티스토리 첫 샘플 본문입니다. 규칙 충족을 위한 텍스트를 채웁니다.</p></div></body></html>`,
    },
    {
      name: "tistory #2",
      platform: "tistory" as const,
      html: `
        <html><head><title>티스토리 글 2</title></head>
        <body><div class="entry-content"><h1>제목2</h1><h2>소제목B</h2><p>티스토리 두 번째 샘플입니다. entry-content fallback이 동작해야 합니다.</p></div></body></html>`,
    },
    {
      name: "tistory #3",
      platform: "tistory" as const,
      html: `
        <html><head><title>티스토리 글 3</title></head>
        <body><article><h1>제목3</h1><h3>소제목C</h3><p>티스토리 세 번째 샘플입니다. article fallback으로 본문을 추출합니다.</p></article></body></html>`,
    },
    {
      name: "blogspot #1",
      platform: "blogspot" as const,
      html: `
        <html><head><title>블로그스팟 글 1</title></head>
        <body><div class="post-body"><h1>제목1</h1><h2>소제목A</h2><p>블로그스팟 첫 샘플 본문입니다. post-body에서 본문을 읽습니다.</p></div></body></html>`,
    },
    {
      name: "blogspot #2",
      platform: "blogspot" as const,
      html: `
        <html><head><title>블로그스팟 글 2</title></head>
        <body><article class="post"><h1>제목2</h1><h3>소제목B</h3><p>블로그스팟 두 번째 샘플입니다. article.post fallback을 검증합니다.</p></article></body></html>`,
    },
    {
      name: "blogspot #3",
      platform: "blogspot" as const,
      html: `
        <html><head><title>블로그스팟 글 3</title></head>
        <body><main><h1>제목3</h1><h2>소제목C</h2><p>블로그스팟 세 번째 샘플입니다. main fallback 선택자 검증용입니다.</p></main></body></html>`,
    },
  ];

  for (const sample of samples) {
    it(`${sample.name} 파싱 성공`, () => {
      const parsed = parseBlogHtml(sample.platform, sample.html);
      expect(parsed).not.toBeNull();
      expect(parsed?.title.length).toBeGreaterThan(0);
      expect(parsed?.bodyText.length).toBeGreaterThan(40);
      expect(parsed?.headings.length).toBeGreaterThan(0);
      expect(parsed?.parserMeta.parserVersion).toContain(sample.platform);
      expect(parsed?.parserMeta.contentSelectorUsed.length).toBeGreaterThan(0);
      expect(parsed?.parserMeta.fallbackDepth).toBeGreaterThan(0);
    });
  }
});

describe("2단계 PARSE_FAILED 표준 응답", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("본문 선택자 실패 시 PARSE_FAILED 반환", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "<html><head><title>x</title></head><body><div>tiny</div></body></html>",
      }),
    );

    const result = await analyzeRequest({
      platform: "naver",
      url: "https://blog.naver.com/userid/223456789",
    });

    expect(result.status).toBe(503);
    expect(result.response.error?.code).toBe("PARSE_FAILED");
    expect(result.response.error?.message).toBe(
      "페이지 구조를 해석하지 못했습니다. 다른 글 URL로 시도해 주세요.",
    );
  });
});

describe("정밀화: 선택자 품질 우선 선택", () => {
  it("텍스트 밀도가 높은 후보를 선택한다", () => {
    const html = `
      <html><head><title>t</title></head><body>
        <div class="post-body"><a href="#">a</a><a href="#">b</a><a href="#">c</a>짧은 텍스트</div>
        <main><h1>제목</h1><p>충분히 긴 본문 텍스트입니다. 문장1. 문장2. 문장3. 문장4.</p></main>
      </body></html>
    `;
    const parsed = parseBlogHtml("blogspot", html);
    expect(parsed).not.toBeNull();
    expect(parsed?.parserMeta.contentSelectorUsed).toBe("main");
  });

  it("플랫폼 선택자 실패 시 글로벌 fallback으로 파싱 성공", () => {
    const html = `
      <html><head><title>fallback test</title></head>
      <body>
        <section>
          <h1>제목</h1>
          <p>이 문서는 플랫폼 전용 선택자가 없는 경우를 가정합니다. 충분한 본문 텍스트를 포함해 fallback 파싱을 검증합니다.</p>
          <p>두 번째 문단입니다. 두 번째 문단입니다. 두 번째 문단입니다.</p>
        </section>
      </body></html>
    `;
    const parsed = parseBlogHtml("naver", html);
    expect(parsed).not.toBeNull();
    expect(parsed?.parserMeta.contentSelectorUsed.startsWith("fallback:")).toBe(true);
  });
});

describe("정밀화: 네이버 iframe 본문 추적", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mainFrame src를 따라가 본문 파싱에 성공", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const href = input.toString();
        if (href.includes("PostView.naver")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              `<html><head><title>frame</title></head><body><div class="se-main-container"><h1>제목</h1><p>프레임 본문 텍스트입니다. 프레임 본문 텍스트입니다. 프레임 본문 텍스트입니다.</p></div></body></html>`,
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () =>
            `<html><head><title>outer</title></head><body><iframe id="mainFrame" src="/PostView.naver?blogId=abc&logNo=1"></iframe></body></html>`,
        };
      }),
    );

    const result = await analyzeRequest({
      platform: "naver",
      url: "https://blog.naver.com/abc/1",
    });

    expect(result.status).toBe(200);
    expect(result.response.error).toBeNull();
    expect(result.response.data?.parsed.bodyText.length).toBeGreaterThan(20);
  });
});
