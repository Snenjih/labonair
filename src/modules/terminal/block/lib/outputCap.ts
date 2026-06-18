const MAX_LINES = 200;
const TRUNCATION_NOTICE = "\n[... output truncated for AI context ...]";

export function capAttachOutput(raw: string): string {
  const lines = raw.split("\n");
  if (lines.length <= MAX_LINES) return raw;
  return lines.slice(0, MAX_LINES).join("\n") + TRUNCATION_NOTICE;
}
