export type ExplorerScope = { type: "local" } | { type: "remote"; hostId: string };

export function scopeKeyFor(scope: ExplorerScope): string {
  return scope.type === "local" ? "local" : `ssh:${scope.hostId}`;
}
