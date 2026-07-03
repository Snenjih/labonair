const isWindowsPath = (p: string) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\") || p.includes("\\");

function quotePath(p: string): string {
  if (isWindowsPath(p)) {
    return `"${p.replace(/`/g, "``").replace(/"/g, '`"')}"`;
  }
  return `'${p.replace(/'/g, "'\\''")}'`;
}

export function dropPaths(paths: string[]): string {
  return paths.map(quotePath).join(" ") + " ";
}
