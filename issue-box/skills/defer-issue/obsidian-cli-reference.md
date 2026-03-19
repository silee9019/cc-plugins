# Obsidian CLI Reference

## 설치 확인

```bash
obsidian --version
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
