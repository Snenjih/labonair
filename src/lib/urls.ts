export function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.host === ub.host && ua.protocol === ub.protocol;
  } catch {
    return a === b;
  }
}
