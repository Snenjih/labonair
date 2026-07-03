/**
 * Path-safety guards for AI tool calls.
 *
 * Goals:
 *  - Block reads of files that almost always contain secrets (.env*, *.pem,
 *    id_rsa*, .aws/credentials, .ssh/, .git/, kube/azure config, etc.).
 *  - Block writes/exec into the same set, plus a few directories where
 *    automated mutation is dangerous (system dirs, home dotfiles you didn't
 *    explicitly target).
 *
 * This is a *defense layer*, not a sandbox. The model may still be coaxed
 * into doing something silly within allowed paths — the user-confirmation
 * UI for write/exec is the real safety net. These checks just ensure that
 * read tools (which auto-approve) can never silently exfiltrate obvious
 * secrets, and that a single bad approval can't blow up the system.
 */

const SECRET_BASENAME_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i, // .env, .env.local, .env.production, etc.
  /^.*\.pem$/i,
  /^.*\.key$/i, // private keys
  /^.*\.p12$/i,
  /^.*\.pfx$/i,
  /^.*\.asc$/i, // GPG armored signatures/keys
  /^.*\.gpg$/i, // GPG encrypted files
  /^.*\.jks$/i, // Java KeyStore
  /^.*\.keystore$/i, // Android/Java keystore
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^known_hosts$/i,
  /^authorized_keys$/i,
  /^htpasswd$/i,
  /^\.netrc$/i,
  /^credentials$/i, // .aws/credentials, gcloud, etc.
  /^\.pgpass$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^secrets?\.(json|ya?ml|toml)$/i,
  /^service_account.*\.json$/i, // GCP service accounts
];

const SECRET_PATH_SEGMENTS = [
  "/.ssh/",
  "/.gnupg/",
  "/.aws/",
  "/.azure/",
  "/.kube/",
  "/.docker/",
  "/.config/gh/",
  "/.config/git/",
  "/.config/gcloud/",
  "/.git/", // git internals — refusing avoids tools mutating refs/objects
  "/var/root/",
  "/private/var/root/",
  "/appdata/roaming/", // Windows roaming profile (gcloud, Azure creds, etc.)
];

const FORBIDDEN_PREFIXES = [
  "/etc/",
  "/var/db/",
  "/System/",
  "/Library/Keychains/",
  "/private/etc/",
  "/private/var/db/",
  "/proc/",
  "/sys/",
  "/var/root/",
  "/private/var/root/",
];

export type SafetyResult = { ok: true } | { ok: false; reason: string };

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function normalize(p: string): string {
  return p
    .replace(/\\/g, "/") // backslash → forward slash
    .replace(/^\/\?\//, "/") // strip UNC prefix (//?/)
    .replace(/^[a-zA-Z]:/, "") // strip Windows drive letter (C:)
    .replace(/:[^/]+/g, "") // strip NTFS alternate data streams (:stream) — applied after drive removal
    .replace(/[. ]+(?=\/|$)/g, "") // strip trailing dots/spaces per segment (Windows discards them)
    .toLowerCase(); // case-insensitive matching
}

export function checkReadable(path: string): SafetyResult {
  const norm = normalize(path);
  const base = basename(norm);

  for (const re of SECRET_BASENAME_PATTERNS) {
    if (re.test(base)) {
      return {
        ok: false,
        reason: `Refused: "${base}" matches a sensitive-file pattern.`,
      };
    }
  }

  for (const seg of SECRET_PATH_SEGMENTS) {
    if (norm.includes(seg)) {
      return {
        ok: false,
        reason: `Refused: path is inside a protected directory (${seg.replace(/\//g, "")}).`,
      };
    }
  }

  return { ok: true };
}

export function checkWritable(path: string): SafetyResult {
  // Writes inherit all read restrictions, plus system-directory blocks.
  const r = checkReadable(path);
  if (!r.ok) return r;

  const norm = normalize(path);
  for (const prefix of FORBIDDEN_PREFIXES) {
    // normalize() lowercases the path, so compare against lowercased prefix too
    if (norm.startsWith(prefix.toLowerCase())) {
      return {
        ok: false,
        reason: `Refused: writes under "${prefix}" are not allowed.`,
      };
    }
  }
  return { ok: true };
}

const DESTRUCTIVE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\brm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s/i, label: "Recursive force delete (rm -rf)" },
  { re: /\bdrop\s+(table|database|schema)\b/i, label: "SQL DROP statement" },
  { re: /\btruncate\s+(table\b|\w)/i, label: "SQL TRUNCATE" },
  { re: /\bgit\s+reset\s+--hard\b/, label: "git reset --hard" },
  { re: /\bgit\s+push\b.*--force\b/, label: "git force push" },
  { re: /\bchmod\s+(-R\s+)?777\b/, label: "chmod 777" },
];

/**
 * Returns a human-readable warning label when a command matches a destructive
 * pattern, or null if the command appears safe. Unlike checkShellCommand, this
 * does NOT block — it surfaces a warning in the approval UI.
 */
export function checkDestructiveCommand(cmd: string): string | null {
  for (const { re, label } of DESTRUCTIVE_PATTERNS) {
    if (re.test(cmd)) return label;
  }
  return null;
}

/**
 * Lightweight heuristic for blocking obviously destructive shell commands
 * even after the user has approved them. The approval UI shows the command
 * verbatim, so the user is the primary gate; this just catches a couple of
 * patterns that almost certainly indicate the model went off the rails.
 */
export function checkShellCommand(cmd: string): SafetyResult {
  const c = cmd.trim();
  // rm -rf / (and variants with quoted /, --no-preserve-root, etc.)
  if (
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+(['"]?\/['"]?\s*($|;|&|\|))/.test(
      c,
    )
  ) {
    return { ok: false, reason: "Refused: command attempts to recursively delete the filesystem root." };
  }
  if (/--no-preserve-root/.test(c)) {
    return { ok: false, reason: "Refused: --no-preserve-root is not allowed." };
  }
  // dd to a raw disk device
  if (/\bdd\b[^|]*\bof=\/dev\/(disk|sd|nvme|hd)/i.test(c)) {
    return { ok: false, reason: "Refused: dd to a block device is not allowed." };
  }
  // mkfs / fdisk / diskutil eraseDisk
  if (/\b(mkfs(\.[a-z0-9]+)?|fdisk|parted)\b/.test(c) || /\bdiskutil\s+erase/i.test(c)) {
    return { ok: false, reason: "Refused: disk-formatting commands are not allowed." };
  }
  return { ok: true };
}
