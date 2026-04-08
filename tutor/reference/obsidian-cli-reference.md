# Obsidian CLI Reference

## 설치 확인

```bash
obsidian --help
```

미설치 시 안내:

```
Obsidian CLI가 설치되어 있지 않습니다.

설치 방법:
  brew tap nicosm/tools
  brew install obsidian-cli

설치 후 다시 실행해주세요.
```

## Vault 목록 조회

```bash
obsidian vaults verbose
```

vault 이름과 경로를 함께 출력한다.

## 폴더 목록 조회

```bash
obsidian vault="<vault-name>" folders
```

지정 vault 내 전체 폴더 목록을 출력한다.

## 노트 생성

```bash
obsidian vault="<vault-name>" create name="<파일명>" path="<폴더경로>" content="<내용>"
```

### content 이스케이프 규칙

- 줄바꿈: `\n`
- 탭: `\t`
- YAML frontmatter의 `---` 구분자도 content 문자열 안에 포함하여 전달

## 파일 목록 조회

```bash
obsidian vault="<vault-name>" files folder="<폴더경로>"
```

지정 폴더 내 파일 목록을 출력한다.

## 노트 읽기

```bash
obsidian vault="<vault-name>" read path="<파일경로>"
```

지정 노트의 전체 내용을 출력한다.

## 텍스트 검색

```bash
obsidian vault="<vault-name>" search query="<검색어>"
```

vault 내에서 검색어가 포함된 노트를 찾는다.

## Property 읽기

```bash
obsidian vault="<vault-name>" property:read name="<속성명>" path="<파일경로>"
```

지정 노트의 YAML frontmatter에서 특정 property 값을 읽는다.

## 노트 이동

```bash
obsidian vault="<vault-name>" move path="<파일경로>" to="<대상폴더경로>/"
```

지정 노트를 대상 폴더로 이동한다. 대상 폴더가 없으면 자동 생성된다.

## Property 설정

```bash
obsidian vault="<vault-name>" property:set name="<속성명>" value="<값>" path="<파일경로>"
```

지정 노트의 YAML frontmatter에서 특정 property 값을 변경한다.
