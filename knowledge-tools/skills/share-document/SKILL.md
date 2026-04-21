---
name: share-document
display_name: share-document
description: |
  마크다운 문서를 공유용 HTML로 변환. pandoc + 내장 CSS 사용.
  트리거: "문서 공유", "HTML 변환", "공유용 HTML", "share document", "pandoc 변환"
user_invocable: true
---

# Share Document

마크다운 파일을 공유용 스타일이 적용된 standalone HTML로 변환한다.

## 의존성

- `pandoc` (설치 확인: `which pandoc`)

## 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| 파일 경로 | Y | 변환할 마크다운 파일의 절대/상대 경로 |

## Steps

### 1. pandoc 확인

```bash
which pandoc
```

없으면 `brew install pandoc` 안내 후 중단.

### 2. 입력 파일 확인

파일 존재 여부 확인. 없으면 에러 메시지 출력 후 중단.

### 3. 전처리 (Obsidian→pandoc 호환)

리스트 항목 앞에 빈 줄이 없으면 삽입. Obsidian은 빈 줄 없이도 리스트를 렌더링하지만 pandoc은 엄격하게 파싱한다.

```bash
sh "${CLAUDE_PLUGIN_ROOT}/scripts/preprocess.sh" "<input.md>" > /tmp/share-doc-preprocessed.md
```

`${CLAUDE_PLUGIN_ROOT}`는 플러그인 루트 경로로 자동 해석된다:
- 개발: `cc-plugins/knowledge-tools/`
- 설치: `~/.claude/plugins/cache/cc-plugins/knowledge-tools/<version>/`

### 4. pandoc 변환

```bash
STYLE_CSS="${CLAUDE_PLUGIN_ROOT}/skills/share-document/style.css"
pandoc /tmp/share-doc-preprocessed.md \
  -t html5 \
  --standalone \
  --css="$STYLE_CSS" \
  --embed-resources \
  -o "<output>.html"
```

- 출력 파일: 입력 파일과 동일 디렉토리, 확장자만 `.html`로 변경
- `--embed-resources`: CSS를 HTML에 인라인 삽입 (단일 파일 공유 가능)

### 5. 정리 및 결과

```bash
rm -f /tmp/share-doc-preprocessed.md
```

생성된 HTML 파일 경로를 출력한다.
