import { promises as fs } from "node:fs"
import { join, basename } from "node:path"

import { parseFrontmatter } from "./utils/frontmatter.js"
import { isMarkdownFile, resolveSymlinkAsync, exists } from "./utils/file-utils.js"
import type { SkillInfo, CommandInfo, SkillMetadata } from "./types.js"

// ─── Skill Scanning ─────────────────────────────────────────────────────────

/**
 * Scan a project's .claude/skills/ directory for skills.
 * Supports three patterns:
 *   1. Directory with SKILL.md inside
 *   2. Directory with <dirname>.md inside
 *   3. Standalone .md file at the top level
 */
export async function scanProjectSkills(
  projectPath: string,
  projectHash: string,
): Promise<SkillInfo[]> {
  const skillsDir = join(projectPath, ".claude", "skills")
  if (!(await exists(skillsDir))) return []

  const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => [])
  const skills: SkillInfo[] = []

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue

    const entryPath = join(skillsDir, entry.name)

    // Pattern 1 & 2: Directory
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      const resolvedPath = await resolveSymlinkAsync(entryPath)
      const dirName = entry.name

      // Try SKILL.md first
      const skillMdPath = join(resolvedPath, "SKILL.md")
      if (await exists(skillMdPath)) {
        try {
          const content = await fs.readFile(skillMdPath, "utf-8")
          const { data } = parseFrontmatter<SkillMetadata>(content)
          skills.push({
            name: data.name || dirName,
            path: skillMdPath,
            projectPath,
            projectHash,
            content,
          })
        } catch {
          // skip
        }
        continue
      }

      // Fallback: <dirname>.md
      const namedMdPath = join(resolvedPath, `${dirName}.md`)
      if (await exists(namedMdPath)) {
        try {
          const content = await fs.readFile(namedMdPath, "utf-8")
          const { data } = parseFrontmatter<SkillMetadata>(content)
          skills.push({
            name: data.name || dirName,
            path: namedMdPath,
            projectPath,
            projectHash,
            content,
          })
        } catch {
          // skip
        }
      }

      continue
    }

    // Pattern 3: Standalone .md file
    if (isMarkdownFile(entry)) {
      const skillName = basename(entry.name, ".md")
      try {
        const content = await fs.readFile(entryPath, "utf-8")
        const { data } = parseFrontmatter<SkillMetadata>(content)
        skills.push({
          name: data.name || skillName,
          path: entryPath,
          projectPath,
          projectHash,
          content,
        })
      } catch {
        // skip
      }
    }
  }

  return skills
}

// ─── Command Scanning ───────────────────────────────────────────────────────

/**
 * Scan a project's .claude/commands/ directory for commands.
 * Subdirectories become namespace prefixes (e.g., db/migrate.md → db:migrate).
 */
export async function scanProjectCommands(
  projectPath: string,
  projectHash: string,
): Promise<CommandInfo[]> {
  const commandsDir = join(projectPath, ".claude", "commands")
  if (!(await exists(commandsDir))) return []

  return scanCommandsRecursive(commandsDir, projectPath, projectHash, new Set(), "")
}

async function scanCommandsRecursive(
  dir: string,
  projectPath: string,
  projectHash: string,
  visited: Set<string>,
  prefix: string,
): Promise<CommandInfo[]> {
  let realPath: string
  try {
    realPath = await fs.realpath(dir)
  } catch {
    return []
  }

  if (visited.has(realPath)) return []
  visited.add(realPath)

  let entries: import("node:fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true }) as import("node:fs").Dirent[]
  } catch {
    return []
  }

  const commands: CommandInfo[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue
      const subDir = join(dir, entry.name)
      const subPrefix = prefix ? `${prefix}:${entry.name}` : entry.name
      const subCommands = await scanCommandsRecursive(
        subDir, projectPath, projectHash, visited, subPrefix,
      )
      commands.push(...subCommands)
      continue
    }

    if (!isMarkdownFile(entry)) continue

    const commandPath = join(dir, entry.name)
    const baseCommandName = basename(entry.name, ".md")
    const commandName = prefix ? `${prefix}:${baseCommandName}` : baseCommandName

    try {
      const content = await fs.readFile(commandPath, "utf-8")
      commands.push({
        name: commandName,
        path: commandPath,
        projectPath,
        projectHash,
        content,
      })
    } catch {
      // skip
    }
  }

  return commands
}
