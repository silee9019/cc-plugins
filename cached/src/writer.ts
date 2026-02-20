import { promises as fs } from "node:fs"
import { join } from "node:path"

import { parseFrontmatter, stringifyFrontmatter } from "./utils/frontmatter.js"
import type { SkillInfo, CommandInfo, SkillMetadata } from "./types.js"

// ─── Write ──────────────────────────────────────────────────────────────────

export async function writeSkillToPlugin(pluginRoot: string, skill: SkillInfo): Promise<void> {
  const skillDir = join(pluginRoot, "skills", `${skill.projectHash}_${skill.name}`)
  await fs.mkdir(skillDir, { recursive: true })

  const { data, body } = parseFrontmatter<SkillMetadata>(skill.content)
  const enhanced: Record<string, unknown> = {
    ...data,
    name: skill.name,
    description: data.description
      ? `[${skill.projectPath}] ${data.description}`
      : `[${skill.projectPath}]`,
  }
  delete enhanced.model

  await fs.writeFile(join(skillDir, "SKILL.md"), stringifyFrontmatter(enhanced, body), "utf-8")
}

export async function writeCommandToPlugin(pluginRoot: string, command: CommandInfo): Promise<void> {
  const commandDir = join(pluginRoot, "commands", command.projectHash)
  await fs.mkdir(commandDir, { recursive: true })

  const { data, body } = parseFrontmatter(command.content)
  const enhanced: Record<string, unknown> = {
    ...data,
    description: typeof data.description === "string"
      ? `[${command.projectPath}] ${data.description}`
      : `[${command.projectPath}]`,
  }
  delete enhanced.model

  await fs.writeFile(join(commandDir, `${command.name}.md`), stringifyFrontmatter(enhanced, body), "utf-8")
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

export async function cleanupProjectFiles(pluginRoot: string, projectHash: string): Promise<void> {
  const skillsDir = join(pluginRoot, "skills")
  const entries = await readDirSafe(skillsDir)
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name.startsWith(`${projectHash}_`))
      .map((e) => fs.rm(join(skillsDir, e.name), { recursive: true, force: true })),
  )

  await fs.rm(join(pluginRoot, "commands", projectHash), { recursive: true, force: true }).catch(() => undefined)
}

async function readDirSafe(dir: string): Promise<import("node:fs").Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true }) as import("node:fs").Dirent[]
  } catch {
    return []
  }
}
