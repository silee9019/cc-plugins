# design.md (google-labs-code) 형식 가이드

[google-labs-code/design.md](https://github.com/google-labs-code/design.md)는 디자인 시스템을 코딩 에이전트에 전달하기 위한 마크다운 포맷. **YAML frontmatter (machine-readable 토큰) + Markdown body (human-readable 근거)** 두 층.

이 스킬에서 design.md는 시안(.pen)의 텍스트 미러 — 시안 = SSOT, design.md = 토큰 머신가독 표면.

## 파일 구조

```
---
version: alpha
name: <project>
description: ...
colors: { ... }
typography: { ... }
rounded: { ... }
spacing: { ... }
components: { ... }
---

## Overview
[본질·원칙·sources of truth]

## Colors
## Typography
## Layout
## Elevation & Depth
## Shapes
## Components
## Do's and Don'ts
```

YAML frontmatter는 `---` 펜스로 감싸 파일 최상단. body는 `##` heading으로 8 sections — **순서가 강제됨** (생략은 가능, 출현 시 순서 어김 안 됨).

## 토큰 schema 요약

```yaml
version: <string>          # optional, current "alpha"
name: <string>
description: <string>      # optional

colors:
  <token-name>: <Color>    # "#1A1C1E" 또는 "{colors.other-token}"

typography:
  <token-name>:            # 객체 형식
    fontFamily: <string>
    fontSize: <Dimension>  # "1rem" / "16px"
    fontWeight: <number|string>
    lineHeight: <number>
    letterSpacing: <Dimension>
    fontFeature: <string>
    fontVariation: <string>

rounded:
  <scale-level>: <Dimension>   # "8px"

spacing:
  <scale-level>: <Dimension|number>  # "8px" 또는 8

components:
  <component-name>:
    backgroundColor: <token ref|color>
    textColor: <token ref|color>
    typography: <token ref>
    rounded: <token ref|dim>
    padding: <Dimension>
    size: <Dimension>
    height: <Dimension>
    width: <Dimension>
```

### Token Types

| 타입 | 형식 | 예시 |
|:---|:---|:---|
| Color | `#` + hex (sRGB) | `"#1A1C1E"` |
| Dimension | number + unit (`px`, `em`, `rem`) | `48px`, `-0.02em` |
| Token Reference | `{path.to.token}` | `{colors.primary}` |
| Typography | 객체 (위 schema) | — |

### YAML 주의사항

- **숫자 키는 quote** — spacing의 `0`, `1` 등을 키로 쓸 때 `"0": 0px` 처럼 문자열 quote. `0: 0`은 number 키로 해석돼 lint 실패 가능.
- **dimension은 string** — `0` 단독은 문제 발생, `"0px"`로.
- **token reference는 string** — `"{colors.primary}"` 형태로 quote.
- **typography 객체** — 키 들여쓰기 일관 (2-space 권장).

## 8 Sections (순서 강제)

| # | Section | Aliases |
|:---|:---|:---|
| 1 | Overview | Brand & Style |
| 2 | Colors | |
| 3 | Typography | |
| 4 | Layout | Layout & Spacing |
| 5 | Elevation & Depth | Elevation |
| 6 | Shapes | |
| 7 | Components | |
| 8 | Do's and Don'ts | |

각 섹션은 **prose 위주**. 토큰 값은 frontmatter에 있고 prose는 *왜* 그 값인지 설명.

## CLI lint

```bash
# 단일 호출 (npx로 다운로드)
npx -p @google/design.md design.md lint design/design.md

# 또는 install 후
npm install -g @google/design.md
design.md lint design/design.md
```

출력은 JSON. errors 0이면 통과.

```json
{
  "findings": [
    { "severity": "warning", "path": "colors.bg-canvas",
      "message": "'bg-canvas' is defined but never referenced by any component." }
  ],
  "summary": { "errors": 0, "warnings": 1, "infos": 0 }
}
```

## 7 Lint Rules

| Rule | Severity | 무엇을 검사 |
|:---|:---|:---|
| `broken-ref` | error | `{colors.primary}` 같은 token reference가 정의된 토큰을 가리키는지 |
| `missing-primary` | warning | colors 정의됐는데 `primary` 색이 없으면 — agent가 자동 생성 |
| `contrast-ratio` | warning | component bg/text pair의 WCAG AA(4.5:1) 미만 |
| `orphaned-tokens` | warning | 정의됐지만 component에서 안 쓰는 색 |
| `token-summary` | info | 토큰 개수 요약 |
| `missing-sections` | info | 토큰 있는데 spacing/rounded 섹션 없을 때 |
| `missing-typography` | warning | colors는 있는데 typography 토큰 없을 때 |
| `section-order` | warning | 8 sections 순서 어긋날 때 |

### orphaned-tokens는 의도적 OK

시스템 팔레트(예: `accent-amber`/`accent-purple`)를 component에서 참조 안 했어도 *팔레트 보존을 위한 의도적 등록*인 경우 warning을 무시하고 시스템 정합성 유지가 합리적. README나 `## Colors` prose에 의도를 명시하면 lint 결과 해석에도 도움.

## 시안과의 동기화

시안 변경 시 design.md를 같은 commit에서 갱신한다. drift 감지·수정 절차:

1. 시안에서 `mcp__pencil__get_variables` 호출 → 토큰 22개~ 추출
2. design.md frontmatter `colors` / `typography` / `rounded` / `spacing`과 비교
3. 불일치 발견 → 시안 우선으로 design.md 갱신
4. lint 재실행

## CSS 매핑 (코드 동기화)

design.md 토큰을 CSS 변수로 1:1 매핑할 때:

```css
:root {
  /* design.md → CSS variable */
  --bg-canvas: #0F1117;
  --fg-primary: #F2F4F8;
  --accent-green: #10B981;

  /* typography */
  --font-sans: "Inter", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --fs-h1: 22px;
  --fs-md: 14px;

  /* radius */
  --r-md: 8px;
  --r-xl: 12px;

  /* spacing */
  --space-7: 16px;
  --space-10: 24px;
}

.btn-primary {
  background: var(--accent-green);
  color: var(--bg-canvas);   /* btn-fg-on-accent */
  border-radius: var(--r-md);
  padding: 10px 18px;
}
```

규칙:
- 토큰 이름은 `--<name>` 그대로 (kebab-case)
- 색상은 hex 그대로
- typography 그룹은 `--font-*` (family) + `--fs-*` (size) 분리
- spacing은 numeric token + scale token 혼합 가능 (`--space-7: 16px`)
- alpha 변형(`#10B98140` 같은) 미토큰은 hex 그대로 두고 추후 `--accent-green-25` 같은 토큰화 검토

## 작성 체크리스트

- [ ] frontmatter `---` 펜스 위·아래
- [ ] `name` 필수 / `description` 권장
- [ ] colors / typography / rounded / spacing 중 사용 토큰 모두 등록
- [ ] components는 핵심 (button-primary / section-card / app-header / input-text 등)
- [ ] section 순서 강제 8개 — 결손 OK, 순서 어김 ✗
- [ ] `npx -p @google/design.md design.md lint <file>` errors 0
- [ ] 시안 토큰과 동기화 (`get_variables` 결과와 비교)
- [ ] orphaned-tokens warning 분석 — 의도적이면 prose에 명시
