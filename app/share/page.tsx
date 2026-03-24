import { parseShareToken } from "@/lib/share";

export default function SharePage({
  searchParams,
}: {
  searchParams: { r?: string };
}) {
  const token = searchParams.r;
  let parsed = null;
  if (token) {
    try {
      parsed = parseShareToken(token);
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    return (
      <main>
        <h1>공유 결과</h1>
        <p>공유 링크가 손상되었거나 만료되었습니다.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>공유 결과 (읽기 전용)</h1>
      <p>{parsed.url}</p>
      <p>
        SEO {parsed.scores.seo} / AEO {parsed.scores.aeo} / GEO {parsed.scores.geo} / CWV{" "}
        {parsed.scores.cwv}
      </p>
      <p>
        DIA {parsed.sq.diaScore} / EEAT {parsed.sq.eeatScore}
      </p>
      <p>변화 추세: {parsed.trend}</p>
    </main>
  );
}
