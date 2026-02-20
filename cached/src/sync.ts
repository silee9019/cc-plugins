import { getProjectHash, loadConfig, loadMetadata, saveMetadata, purgeExpiredEntries } from "./cache.js"
import { scanProjectSkills, scanProjectCommands } from "./scanner.js"
import { writeSkillToPlugin, writeCommandToPlugin, cleanupProjectFiles } from "./writer.js"
import type { SyncResult } from "./types.js"

/**
 * Cache current project's skills/commands to metadata + plugin directory.
 * Purge stale entries and their files.
 */
export async function sync(pluginRoot: string): Promise<SyncResult> {
  const startTime = Date.now()

  const config = await loadConfig()
  let metadata = await loadMetadata()

  const currentProject = process.cwd()
  const currentHash = getProjectHash(currentProject)

  // 1. Scan current project and write to plugin directory
  const skills = await scanProjectSkills(currentProject, currentHash)
  const commands = await scanProjectCommands(currentProject, currentHash)

  let scannedCurrent = false

  if (skills.length > 0 || commands.length > 0) {
    // Clean old files first, then write fresh
    await cleanupProjectFiles(pluginRoot, currentHash)

    for (const skill of skills) {
      await writeSkillToPlugin(pluginRoot, skill)
    }
    for (const command of commands) {
      await writeCommandToPlugin(pluginRoot, command)
    }

    metadata.projects[currentHash] = {
      path: currentProject,
      cachedAt: Date.now(),
      skills: skills.map((s) => ({ name: s.name, content: s.content })),
      commands: commands.map((c) => ({ name: c.name, content: c.content })),
    }
    scannedCurrent = true
  }

  // 2. Purge expired entries and their files
  const purged = purgeExpiredEntries(metadata, config.cacheTTL)
  for (const hash of Object.keys(metadata.projects)) {
    if (!purged.projects[hash]) {
      await cleanupProjectFiles(pluginRoot, hash)
    }
  }

  await saveMetadata(purged)

  return {
    scannedCurrent,
    skillCount: skills.length,
    commandCount: commands.length,
    duration: Date.now() - startTime,
  }
}
