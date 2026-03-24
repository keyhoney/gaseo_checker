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

  it("홍보/추천 문구보다 실제 본문 후보를 우선 선택한다", () => {
    const html = `
      <html><head><title>promo test</title></head><body>
        <div id="content">
          <p>추천 글 모음! 다른 글도 확인하세요. 구독하고 인기글 더 보기.</p>
          <a href="https://example.com/a">A</a><a href="https://example.com/b">B</a><a href="https://example.com/c">C</a>
        </div>
        <div id="content">
          <h1>본문 제목</h1>
          <p>이 문단은 실제 본문입니다. 핵심 내용을 설명하고 근거를 제시합니다.</p>
          <p>두 번째 문단도 본문 품질을 높이기 위해 충분한 길이를 포함합니다.</p>
        </div>
      </body></html>
    `;
    const parsed = parseBlogHtml("tistory", html);
    expect(parsed).not.toBeNull();
    expect(parsed?.bodyText).toContain("실제 본문입니다");
    expect(parsed?.bodyText).not.toContain("추천 글 모음");
  });
});

describe("티스토리 실전형 레이아웃 검증", () => {
  it("fumikawa 케이스: 본문 우선 추출, 사이드바/관련글 노이즈 배제", () => {
    const html = `
      <html><head><title>한국은 당연하지만 일본은 이제 유행하는 것</title></head><body>
        <header><nav>홈 방명록 유튜브</nav></header>
        <aside>
          <h3>최근글</h3>
          <p>도쿄 벚꽃 개화 소식 2026</p>
          <p>인기글</p>
          <p>태그</p>
        </aside>
        <div class="tt_article_useless_p_margin">
          <h1>한국은 당연하지만 일본은 이제 유행하는 것</h1>
          <p>아키하바라에 갔다가 밥시간이 되어 식당 검색을 하니 반찬 종류가 꽤 많이 나오는 정식집을 찾았다.</p>
          <p>일본은 반찬을 안 준다기보다, 오히려 뭔가를 내어주는 식당이 더 고맙게 느껴진다.</p>
          <p>요즘 일본에서 유행하는 코바치 정식으로 유명한 집이다.</p>
          <p>작은 반찬 코바치 정식은 작은 접시에 여러 가지 반찬이 나온다.</p>
        </div>
        <section class="related"><h4>관련글</h4><a href="/2430">일본 서비스업에서 3인과 3명의 차이</a></section>
        <footer>Designed by 티스토리</footer>
      </body></html>
    `;
    const parsed = parseBlogHtml("tistory", html);
    expect(parsed).not.toBeNull();
    expect(parsed?.bodyText).toContain("코바치 정식");
    expect(parsed?.bodyText).not.toContain("Designed by 티스토리");
    expect(parsed?.bodyText).not.toContain("최근글");
  });

  it("heydayin 케이스: 건강정보 본문 유지, 카테고리/태그 노이즈 배제", () => {
    const html = `
      <html><head><title>소변 색으로 보는 건강 상태</title></head><body>
        <div class="entry-content">
          <h1>소변 색으로 보는 건강 상태, 이 색 나오면 바로 병원 가세요</h1>
          <p>소변 색은 우리 몸 상태를 가장 빠르게 보여주는 건강 지표입니다.</p>
          <p>투명한 소변, 연한 노란색, 진한 노란색, 갈색, 붉은색, 거품 소변, 녹색 소변의 기준을 정리합니다.</p>
          <p>반드시 병원 가야 하는 기준: 붉거나 갈색 소변, 거품 지속, 배뇨 통증, 3일 이상 색 변화.</p>
          <p>소변으로 건강 지키는 습관: 물 섭취, 카페인 줄이기, 짜게 먹지 않기, 소변 참지 않기.</p>
        </div>
        <div id="sidebar">
          <h3>카테고리</h3>
          <p>건강정보 건강음식 의약품 영양제</p>
          <h3>태그</h3>
          <p>건강신호 단백뇨증상 소변색건강</p>
        </div>
      </body></html>
    `;
    const parsed = parseBlogHtml("tistory", html);
    expect(parsed).not.toBeNull();
    expect(parsed?.bodyText).toContain("반드시 병원 가야 하는 기준");
    expect(parsed?.bodyText).not.toContain("카테고리");
    expect(parsed?.bodyText).not.toContain("태그");
  });

  it("ribi 케이스: 상세 본문 유지, 댓글/인기글/최신글 노이즈 배제", () => {
    const html = `
      <html><head><title>예향정 선릉역점</title></head><body>
        <div class="article-view">
          <h1>"갓 지은 밥이 밥솥 채로 나오는" 집밥보다 더 집밥 같은 쌈밥 맛집</h1>
          <p>선릉역 근처에서 건강과 맛을 동시에 잡은 쌈밥 맛집, 예향정을 방문했습니다.</p>
          <p>직화제육볶음은 입에 넣는 순간 강렬한 불맛이 혀끝을 감싸고 매콤 달콤한 양념이 어우러집니다.</p>
          <p>갓 지은 뜨끈한 밥으로 마무리하는 선릉역 예향정에서의 점심은 든든한 에너지를 줍니다.</p>
        </div>
        <div class="comment">댓글 24개</div>
        <div class="popular">인기글</div>
        <div class="latest">최신글</div>
      </body></html>
    `;
    const parsed = parseBlogHtml("tistory", html);
    expect(parsed).not.toBeNull();
    expect(parsed?.bodyText).toContain("직화제육볶음");
    expect(parsed?.bodyText).not.toContain("댓글 24개");
    expect(parsed?.bodyText).not.toContain("인기글");
    expect(parsed?.bodyText).not.toContain("최신글");
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
