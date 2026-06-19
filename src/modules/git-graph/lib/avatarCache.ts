// Module-level cache for GitHub avatar resolution — persists for the full app session.
// key: GitHub user ID (string)
// value: true = avatar loaded successfully, false = error/not available
const cache = new Map<string, boolean>();

export function parseGithubUserId(email: string): string | null {
  const m = /^(\d+)\+.+@users\.noreply\.github\.com$/.exec(email);
  return m ? m[1] : null;
}

export function getAvatarUrl(userId: string, size: number): string {
  return `https://avatars.githubusercontent.com/u/${userId}?v=4&s=${size}`;
}

export function getCached(userId: string): boolean | undefined {
  return cache.get(userId);
}

export function setCached(userId: string, ok: boolean): void {
  cache.set(userId, ok);
}
