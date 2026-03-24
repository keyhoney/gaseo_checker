const YMYL_PATTERNS: RegExp[] = [
  /(암|당뇨|고혈압|심근경색|뇌졸중|우울증|불면증|통증)/,
  /(처방|복용법|용량|부작용|금기|치료법|수술|예방접종)/,
  /(주식추천|코인추천|매수타이밍|수익보장|레버리지|대출한도|신용등급|금리)/,
  /(고소|고발|소송|합의금|손해배상|형사처벌|민사소송|계약해지|위약금)/,
  /(정부지원금|재난지원|안전수칙|사고대응|응급연락)/,
];

export function detectYmyl(text: string): { isYmyl: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const pattern of YMYL_PATTERNS) {
    const found = text.match(pattern);
    if (found?.[0]) matches.push(found[0]);
  }
  return { isYmyl: matches.length > 0, matches };
}
