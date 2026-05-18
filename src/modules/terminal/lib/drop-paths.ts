function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\") || p.includes("\\");
}

function quotePosix(p: string): string {
  return "'" + p.split("'").join("'\\''") + "'";
}

// PowerShell: backtick-escaped inside double quotes
function quoteWindows(p: string): string {
  return '`"' + p.split('"').join('`"') + '`"';
}

export function quotePath(p: string): string {
  return isWindowsPath(p) ? quoteWindows(p) : quotePosix(p);
}

export function dropPaths(paths: string[]): string {
  return paths.map(quotePath).join(" ") + " ";
}
