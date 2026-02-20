import { promises as fs } from "node:fs"
import { resolve } from "node:path"

/**
 * Check if a directory entry is a non-hidden markdown file.
 */
export function isMarkdownFile(entry: { name: string; isFile: () => boolean }): boolean {
  return !entry.name.startsWith(".") && entry.name.endsWith(".md") && entry.isFile()
}

/**
 * Resolve symlinks to their real target path.
 * Returns the original path if it's not a symlink or on error.
 */
export async function resolveSymlinkAsync(filePath: string): Promise<string> {
  try {
    const stats = await fs.lstat(filePath)
    if (stats.isSymbolicLink()) {
      const linkTarget = await fs.readlink(filePath)
      return resolve(filePath, "..", linkTarget)
    }
    return filePath
  } catch {
    return filePath
  }
}

/**
 * Check if a path exists.
 */
export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}
