export function getGitRoot(cwd: string): string | null {
  const result = Bun.spawnSync({
    cmd: ["git", "-C", cwd, "--no-optional-locks", "rev-parse", "--show-toplevel"],
    stderr: "ignore",
  });
  if (result.exitCode !== 0) return null;
  return result.stdout.toString().trim();
}

export function getGitBranch(cwd: string): string | null {
  const result = Bun.spawnSync({
    cmd: ["git", "-C", cwd, "--no-optional-locks", "rev-parse", "--abbrev-ref", "HEAD"],
    stderr: "ignore",
  });
  if (result.exitCode !== 0) return null;
  const branch = result.stdout.toString().trim();
  if (branch === "HEAD") return null; // detached HEAD
  return branch;
}
