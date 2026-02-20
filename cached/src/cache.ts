import { promises as fs } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"

import { getCacheConfigDir } from "./utils/config-dir.js"
import type { CacheConfig, CacheMetadata } from "./types.js"
import { DEFAULT_CONFIG, CACHE_VERSION } from "./types.js"

// ─── Hash ───────────────────────────────────────────────────────────────────

export function getProjectHash(projectDir: string): string {
  return createHash("sha256").update(projectDir).digest("hex").slice(0, 6)
}

// ─── Config ─────────────────────────────────────────────────────────────────

export async function loadConfig(): Promise<CacheConfig> {
  const configDir = getCacheConfigDir()
  const configPath = join(configDir, "config.json")

  try {
    const raw = await fs.readFile(configPath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<CacheConfig>

    return {
      cacheTTL: parsed.cacheTTL ?? DEFAULT_CONFIG.cacheTTL,
    }
  } catch {
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8")
    return { ...DEFAULT_CONFIG }
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

function getMetadataPath(): string {
  return join(getCacheConfigDir(), "metadata.json")
}

export async function loadMetadata(): Promise<CacheMetadata> {
  try {
    const raw = await fs.readFile(getMetadataPath(), "utf-8")
    const parsed = JSON.parse(raw) as unknown

    if (
      parsed &&
      typeof parsed === "object" &&
      "version" in parsed &&
      (parsed as { version: number }).version === CACHE_VERSION
    ) {
      return parsed as CacheMetadata
    }
  } catch {
    // No metadata yet
  }

  return { version: CACHE_VERSION, projects: {} }
}

export async function saveMetadata(metadata: CacheMetadata): Promise<void> {
  const configDir = getCacheConfigDir()
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(getMetadataPath(), JSON.stringify(metadata), "utf-8")
}

// ─── Purge ──────────────────────────────────────────────────────────────────

export function purgeExpiredEntries(
  metadata: CacheMetadata,
  cacheTTL: number,
): CacheMetadata {
  const now = Date.now()
  const valid: Record<string, CacheMetadata["projects"][string]> = {}

  for (const [hash, entry] of Object.entries(metadata.projects)) {
    if (now - entry.cachedAt <= cacheTTL) {
      valid[hash] = entry
    }
  }

  return { ...metadata, projects: valid }
}
