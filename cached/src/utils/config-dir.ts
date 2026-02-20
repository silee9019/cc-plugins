import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Resolve the Claude Code config directory.
 * Respects CLAUDE_CONFIG_DIR env override, defaults to ~/.claude.
 */
export function getClaudeConfigDir(): string {
  const envDir = process.env.CLAUDE_CONFIG_DIR
  if (envDir) return envDir
  return join(homedir(), ".claude")
}

/**
 * Resolve the plugin cache config directory.
 * Stores cache metadata and user configuration.
 */
export function getCacheConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(xdgConfig, "claude-skill-cache")
}
