// CJK 문자는 터미널에서 2칸 차지
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK Radicals
    (code >= 0x3040 && code <= 0x33bf) || // Japanese, CJK Compat
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ext A
    (code >= 0x4e00 && code <= 0xa4cf) || // CJK Unified + Yi
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compat Ideographs
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK Compat Forms
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Signs
    (code >= 0x20000 && code <= 0x2fffd) || // CJK Ext B+
    (code >= 0x30000 && code <= 0x3fffd) // CJK Ext G+
  );
}

export function charWidth(code: number): number {
  return isWide(code) ? 2 : 1;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function displayWidth(str: string): number {
  const clean = stripAnsi(str);
  let w = 0;
  for (const ch of clean) {
    w += charWidth(ch.codePointAt(0)!);
  }
  return w;
}

export function truncate(text: string, maxCols: number): string {
  const clean = text.replace(/[\n\t\r]/g, " ");
  if (displayWidth(clean) <= maxCols) return clean;

  let result = "";
  let cols = 0;
  for (const ch of clean) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (cols + cw > maxCols - 1) break;
    result += ch;
    cols += cw;
  }
  return result + "\u2026"; // …
}
