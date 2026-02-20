import { sync } from "./sync.js"

async function main(): Promise<void> {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd()

  try {
    const result = await sync(pluginRoot)

    if (result.scannedCurrent) {
      console.log(
        `[skill-cache] cached ${result.skillCount} skills, ${result.commandCount} commands (${result.duration}ms)`,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[skill-cache] Sync failed: ${message}`)
  }

  process.exit(0)
}

main()
