import yaml from "js-yaml"

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T
  body: string
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Uses JSON_SCHEMA for security (prevents code execution via YAML tags).
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string,
): FrontmatterResult<T> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n([\s\S]*)$/)

  if (!match) {
    return { data: {} as T, body: content }
  }

  try {
    const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA })
    return { data: (parsed ?? {}) as T, body: match[2] }
  } catch {
    return { data: {} as T, body: match[2] }
  }
}

/**
 * Serialize frontmatter data and body back to markdown string.
 */
export function stringifyFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  )

  if (Object.keys(cleanData).length === 0) {
    return body
  }

  const yamlStr = yaml.dump(cleanData, {
    schema: yaml.JSON_SCHEMA,
    lineWidth: -1,
    quotingType: '"',
  }).trimEnd()

  return `---\n${yamlStr}\n---\n${body}`
}
