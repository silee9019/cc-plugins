// ─── Configuration ──────────────────────────────────────────────────────────

export interface CacheConfig {
  /** Cache time-to-live in milliseconds (default: 3 days) */
  cacheTTL: number
}

export const DEFAULT_CONFIG: CacheConfig = {
  cacheTTL: 3 * 24 * 60 * 60 * 1000, // 3 days
}

// ─── Skill / Command Scanning ───────────────────────────────────────────────

export interface SkillMetadata {
  name?: string
  description?: string
  model?: string
  "argument-hint"?: string
  "allowed-tools"?: string | string[]
}

export interface SkillInfo {
  name: string
  path: string
  projectPath: string
  projectHash: string
  content: string
}

export interface CommandInfo {
  name: string
  path: string
  projectPath: string
  projectHash: string
  content: string
}

// ─── Cache Metadata (lazy caching with full content) ────────────────────────

export interface CachedSkillEntry {
  name: string
  content: string
}

export interface CachedCommandEntry {
  name: string
  content: string
}

export interface CachedProjectEntry {
  path: string
  cachedAt: number
  skills: CachedSkillEntry[]
  commands: CachedCommandEntry[]
}

export interface CacheMetadata {
  version: number
  projects: Record<string, CachedProjectEntry>
}

export const CACHE_VERSION = 2

// ─── Sync Result ────────────────────────────────────────────────────────────

export interface SyncResult {
  scannedCurrent: boolean
  skillCount: number
  commandCount: number
  duration: number
}
