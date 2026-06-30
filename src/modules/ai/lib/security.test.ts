import { describe, expect, it } from "vitest";
import {
  checkDestructiveCommand,
  checkReadable,
  checkShellCommand,
  checkWritable,
} from "./security";

// ─── checkReadable ────────────────────────────────────────────────────────────

describe("checkReadable — secret file basename patterns", () => {
  it.each([
    ["/home/user/.env"],
    ["/project/.env.local"],
    ["/project/.env.production"],
    ["/project/.env.staging"],
  ])("blocks %s (.env variants)", (path) => {
    expect(checkReadable(path).ok).toBe(false);
  });

  it.each([
    ["/home/user/.ssh/id_rsa"],
    ["/home/user/.ssh/id_ed25519"],
    ["/home/user/.ssh/id_ecdsa"],
    ["/home/user/.ssh/id_rsa.pub"],
    ["/home/user/.ssh/id_ed25519.pub"],
  ])("blocks %s (SSH private/public keys)", (path) => {
    expect(checkReadable(path).ok).toBe(false);
  });

  it.each([
    ["/home/user/cert.pem"],
    ["/home/user/private.key"],
    ["/home/user/keystore.p12"],
    ["/home/user/keystore.pfx"],
    ["/home/user/signature.asc"],
    ["/home/user/encrypted.gpg"],
    ["/home/user/app.jks"],
    ["/home/user/android.keystore"],
  ])("blocks %s (key/cert file extensions)", (path) => {
    expect(checkReadable(path).ok).toBe(false);
  });

  it.each([
    ["/home/user/.ssh/known_hosts"],
    ["/home/user/.ssh/authorized_keys"],
    ["/home/user/.netrc"],
    ["/home/user/.pgpass"],
    ["/home/user/.npmrc"],
    ["/home/user/.pypirc"],
    ["/home/user/secrets.json"],
    ["/home/user/secrets.yaml"],
    ["/home/user/secrets.toml"],
    ["/home/user/service_account_prod.json"],
  ])("blocks %s (secret file patterns)", (path) => {
    expect(checkReadable(path).ok).toBe(false);
  });
});

describe("checkReadable — protected path segments", () => {
  it.each([
    ["/home/user/.ssh/config"],
    ["/home/user/.ssh/id_rsa"],
  ])("blocks %s (inside .ssh/)", (path) => {
    expect(checkReadable(path).ok).toBe(false);
  });

  it.each([
    ["/home/user/.gnupg/pubring.kbx"],
    ["/home/user/.aws/credentials"],
    ["/home/user/.aws/config"],
    ["/home/user/.azure/profile"],
    ["/home/user/.kube/config"],
    ["/home/user/.docker/config.json"],
    ["/home/user/.config/gh/hosts.yml"],
    ["/home/user/.config/git/credentials"],
    ["/home/user/.config/gcloud/credentials.db"],
    ["/home/user/project/.git/config"],
    ["/home/user/project/.git/COMMIT_EDITMSG"],
  ])("blocks %s (inside protected dir segment)", (path) => {
    expect(checkReadable(path).ok).toBe(false);
  });
});

describe("checkReadable — case insensitivity", () => {
  it("blocks .ENV (uppercase)", () => {
    expect(checkReadable("/project/.ENV").ok).toBe(false);
  });

  it("blocks ID_RSA (uppercase)", () => {
    expect(checkReadable("/home/user/.ssh/ID_RSA").ok).toBe(false);
  });
});

describe("checkReadable — Windows path normalization", () => {
  it("blocks C:\\Users\\foo\\.env", () => {
    expect(checkReadable("C:\\Users\\foo\\.env").ok).toBe(false);
  });

  it("blocks C:\\Users\\foo\\.ssh\\id_rsa", () => {
    expect(checkReadable("C:\\Users\\foo\\.ssh\\id_rsa").ok).toBe(false);
  });

  it("blocks UNC path //?/.env", () => {
    expect(checkReadable("//?/.env").ok).toBe(false);
  });
});

describe("checkReadable — safe paths allowed", () => {
  it.each([
    ["src/main.ts"],
    ["/home/user/project/package.json"],
    ["/home/user/notes.txt"],
    ["/tmp/output.log"],
    ["/home/user/.bashrc"],
  ])("allows %s", (path) => {
    expect(checkReadable(path).ok).toBe(true);
  });

  it("NTFS alternate data stream in safe file is still allowed", () => {
    // The stream part is stripped by normalize(), leaving just the base filename
    // file.txt:metadata → file.txt (stream stripped)
    expect(checkReadable("/project/file.txt:metadata").ok).toBe(true);
  });
});

describe("checkReadable — error message content", () => {
  it("includes a reason on failure", () => {
    const result = checkReadable("/home/user/.env");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe("string");
    }
  });
});

// ─── checkWritable ────────────────────────────────────────────────────────────

describe("checkWritable — inherits read restrictions", () => {
  it("blocks .env (read restriction inherited)", () => {
    expect(checkWritable("/project/.env").ok).toBe(false);
  });

  it("blocks .ssh/id_rsa (read restriction inherited)", () => {
    expect(checkWritable("/home/user/.ssh/id_rsa").ok).toBe(false);
  });
});

describe("checkWritable — forbidden prefix blocks", () => {
  it.each([
    ["/etc/hosts"],
    ["/etc/passwd"],
    ["/var/db/something"],
    ["/proc/self/mem"],
    ["/sys/kernel/debug"],
    ["/var/root/foo"],
    ["/private/etc/hosts"],
    ["/private/var/db/something"],
    ["/private/var/root/foo"],
  ])("blocks writes to %s (system prefix)", (path) => {
    expect(checkWritable(path).ok).toBe(false);
  });

  it("blocks /System/Library/foo (macOS system dir)", () => {
    expect(checkWritable("/System/Library/foo").ok).toBe(false);
  });

  it("blocks /Library/Keychains/System.keychain", () => {
    expect(checkWritable("/Library/Keychains/System.keychain").ok).toBe(false);
  });
});

describe("checkWritable — safe paths allowed", () => {
  it.each([
    ["/home/user/myfile.txt"],
    ["/tmp/output.json"],
    ["/home/user/project/src/main.ts"],
  ])("allows writes to %s", (path) => {
    expect(checkWritable(path).ok).toBe(true);
  });
});

// ─── checkDestructiveCommand ──────────────────────────────────────────────────

describe("checkDestructiveCommand — detects destructive patterns", () => {
  it("detects recursive force delete (rm -rf)", () => {
    const label = checkDestructiveCommand("rm -rf /tmp/old_build");
    expect(label).toBe("Recursive force delete (rm -rf)");
  });

  it("detects SQL DROP TABLE", () => {
    const label = checkDestructiveCommand("DROP TABLE users");
    expect(label).toBe("SQL DROP statement");
  });

  it("detects SQL DROP DATABASE", () => {
    const label = checkDestructiveCommand("drop database mydb");
    expect(label).toBe("SQL DROP statement");
  });

  it("detects SQL TRUNCATE TABLE", () => {
    const label = checkDestructiveCommand("TRUNCATE TABLE sessions");
    expect(label).toBe("SQL TRUNCATE");
  });

  it("detects git reset --hard", () => {
    const label = checkDestructiveCommand("git reset --hard HEAD~1");
    expect(label).toBe("git reset --hard");
  });

  it("detects git push --force", () => {
    const label = checkDestructiveCommand("git push origin main --force");
    expect(label).toBe("git force push");
  });

  it("detects chmod 777", () => {
    const label = checkDestructiveCommand("chmod 777 /var/www");
    expect(label).toBe("chmod 777");
  });

  it("detects chmod -R 777", () => {
    const label = checkDestructiveCommand("chmod -R 777 /var/www");
    expect(label).toBe("chmod 777");
  });
});

describe("checkDestructiveCommand — safe commands return null", () => {
  it.each([
    ["ls -la"],
    ["git status"],
    ["npm install"],
    ["rm file.txt"],
    ["git push origin main"],
    ["chmod 755 script.sh"],
  ])("returns null for: %s", (cmd) => {
    expect(checkDestructiveCommand(cmd)).toBeNull();
  });
});

// ─── checkShellCommand ────────────────────────────────────────────────────────

describe("checkShellCommand — blocks dangerous shell commands", () => {
  it("blocks rm -rf /", () => {
    expect(checkShellCommand("rm -rf /").ok).toBe(false);
  });

  it('blocks rm -rf "/"', () => {
    expect(checkShellCommand('rm -rf "/"').ok).toBe(false);
  });

  it("blocks rm -fr /", () => {
    expect(checkShellCommand("rm -fr /").ok).toBe(false);
  });

  it("blocks --no-preserve-root", () => {
    expect(checkShellCommand("rm -rf --no-preserve-root /").ok).toBe(false);
  });

  it("blocks dd to block device /dev/sda", () => {
    expect(checkShellCommand("dd if=/dev/zero of=/dev/sda").ok).toBe(false);
  });

  it("blocks dd to /dev/disk0", () => {
    expect(checkShellCommand("dd if=/dev/zero of=/dev/disk0").ok).toBe(false);
  });

  it("blocks dd to /dev/nvme0", () => {
    expect(checkShellCommand("dd if=/dev/urandom of=/dev/nvme0n1").ok).toBe(false);
  });

  it("blocks mkfs.ext4", () => {
    expect(checkShellCommand("mkfs.ext4 /dev/sdb1").ok).toBe(false);
  });

  it("blocks mkfs (bare)", () => {
    expect(checkShellCommand("mkfs /dev/sdb").ok).toBe(false);
  });

  it("blocks fdisk", () => {
    expect(checkShellCommand("fdisk /dev/sda").ok).toBe(false);
  });

  it("blocks diskutil eraseDisk", () => {
    expect(checkShellCommand("diskutil eraseDisk APFS MyDisk /dev/disk2").ok).toBe(false);
  });
});

describe("checkShellCommand — safe commands are allowed", () => {
  it.each([
    ["rm -rf /tmp/build"],
    ["rm -rf ./node_modules"],
    ["git status"],
    ["ls -la /"],
    ["dd if=/dev/zero of=./disk.img bs=1M count=10"],
    ["echo 'hello'"],
    ["npm run build"],
  ])("allows: %s", (cmd) => {
    expect(checkShellCommand(cmd).ok).toBe(true);
  });
});

describe("checkShellCommand — includes reason on block", () => {
  it("returns reason string when blocked", () => {
    const result = checkShellCommand("rm -rf /");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
