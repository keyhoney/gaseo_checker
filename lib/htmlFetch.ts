export interface FetchHtmlOptions {
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
}

function detectCharsetFromText(text: string): string | null {
  const metaCharset = text.match(/<meta[^>]*charset=["']?\s*([a-zA-Z0-9_-]+)/i)?.[1];
  if (metaCharset) return metaCharset.toLowerCase();
  const metaContentType = text.match(
    /<meta[^>]*http-equiv=["']content-type["'][^>]*content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i,
  )?.[1];
  if (metaContentType) return metaContentType.toLowerCase();
  return null;
}

function decodeHtmlBuffer(
  buffer: Uint8Array,
  response: Pick<Response, "headers"> | { headers?: { get?: (name: string) => string | null } },
): string {
  const contentType =
    typeof response?.headers?.get === "function" ? response.headers.get("content-type") ?? "" : "";
  const headerCharset = contentType.match(/charset=([a-zA-Z0-9_-]+)/i)?.[1]?.toLowerCase() ?? null;

  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const metaCharset = detectCharsetFromText(utf8Text);
  const charset = metaCharset ?? headerCharset ?? "utf-8";

  if (charset === "euc-kr" || charset === "ks_c_5601-1987" || charset === "cp949") {
    try {
      return new TextDecoder("euc-kr").decode(buffer);
    } catch {
      return utf8Text;
    }
  }

  return utf8Text;
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

      let raw: Uint8Array;
      if (typeof response.arrayBuffer === "function") {
        raw = new Uint8Array(await response.arrayBuffer());
      } else {
        const textFallback = await response.text();
        raw = new TextEncoder().encode(textFallback);
      }
      const html = decodeHtmlBuffer(raw, response);
      if (!html || html.trim().length === 0) {
        throw new Error("EMPTY_HTML");
      }
      if (raw.byteLength > maxBytes) {
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
