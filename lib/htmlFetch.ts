export interface FetchHtmlOptions {
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
}

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const retries = options.retries ?? 1;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; gaseo-checker/0.1; +https://example.local)",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const html = await response.text();
      if (!html || html.trim().length === 0) {
        throw new Error("EMPTY_HTML");
      }
      if (Buffer.byteLength(html, "utf8") > maxBytes) {
        throw new Error("MAX_BYTES_EXCEEDED");
      }

      clearTimeout(timer);
      return html;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt === retries) break;
    }
  }

  throw lastError ?? new Error("FETCH_FAILED");
}
