import { cn } from "@/lib/utils";
import type { QuickConnectParams } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  tabId: string;
  hostId?: string;
  quickConnect?: QuickConnectParams;
  hostName?: string;
  connectionType?: "ssh" | "sftp";
  initialCols?: number;
  initialRows?: number;
  onConnected: () => void;
  onError: (message: string) => void;
}

type Status =
  | "quick_connect_password"
  | "connecting"
  | "waiting_trust"
  | "waiting_auth"
  | "waiting_passphrase"
  | "error";

const SSH_STAGES = ["TCP Connect", "Handshake", "Auth", "Shell"] as const;
const SFTP_STAGES = ["TCP Connect", "Handshake", "Auth", "SFTP"] as const;

function detectStage(logs: string[]): number {
  const last = logs[logs.length - 1] ?? "";
  if (last.includes("Shell channel") || last.includes("Session established") || last.includes("SFTP ready"))
    return 4;
  if (last.includes("Authenticat") || last.includes("credentials") || last.includes("keychain"))
    return 3;
  if (last.includes("fingerprint") || last.includes("Verifying") || last.includes("handshake") || last.includes("Handshake"))
    return 2;
  if (last.includes("TCP") || last.includes("Connecting"))
    return 1;
  return 0;
}

export function SshLoadingScreen({ tabId, hostId, quickConnect, hostName, connectionType = "ssh", initialCols, initialRows, onConnected, onError }: Props) {
  const isQuickConnect = !hostId && !!quickConnect;
  const initSftp = connectionType === "sftp";

  const [status, setStatus] = useState<Status>(
    isQuickConnect ? "quick_connect_password" : "connecting"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [host, setHost] = useState("");
  const [promptMessage, setPromptMessage] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isMismatch, setIsMismatch] = useState(false);
  const [quickPassword, setQuickPassword] = useState("");

  const connectingRef = useRef(false);
  const pendingPasswordRef = useRef<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const pushLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const STAGES = initSftp ? SFTP_STAGES : SSH_STAGES;
  const currentStage = useMemo(() => detectStage(logs), [logs]);

  const doConnect = (passphraseArg?: string, passwordOverride?: string) => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setStatus("connecting");
    if (!passphraseArg && !passwordOverride) setLogs([]);

    const p: Promise<unknown> = isQuickConnect
      ? invoke("ssh_connect_quick", {
          tabId,
          username: quickConnect!.username,
          hostAddress: quickConnect!.hostAddress,
          port: quickConnect!.port,
          password: passwordOverride ?? "",
          passphrase: passphraseArg ?? null,
          initialCols: initialCols ?? null,
          initialRows: initialRows ?? null,
        })
      : invoke("ssh_connect", {
          tabId,
          hostId,
          passphrase: passphraseArg ?? null,
          passwordOverride: passwordOverride ?? null,
          initSftp,
          initialCols: initialCols ?? null,
          initialRows: initialRows ?? null,
        });

    p.then(() => {
      // session_established event triggers onConnected
    })
      .catch((err: unknown) => {
        const msg = String(err);
        if (
          msg.includes("mismatch") ||
          msg.includes("passphrase_required") ||
          msg.includes("authentication failed") ||
          msg.includes("not authenticated")
        )
          return;
        setErrorMessage(msg);
        setStatus("error");
      })
      .finally(() => {
        connectingRef.current = false;
      });
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    Promise.all([
      listen<{ tab_id: string; message: string }>("ssh_connect_log", (event) => {
        if (event.payload.tab_id !== tabId) return;
        pushLog(event.payload.message);
      }),
      listen<{ tab_id: string; fingerprint: string; host: string; is_mismatch: boolean }>(
        "known_hosts_warning",
        (event) => {
          if (event.payload.tab_id !== tabId) return;
          setFingerprint(event.payload.fingerprint);
          setHost(event.payload.host);
          setIsMismatch(event.payload.is_mismatch);
          setStatus("waiting_trust");
        },
      ),
      listen<{ tab_id: string; prompt_message: string; is_2fa: boolean }>(
        "auth_required",
        (event) => {
          if (event.payload.tab_id !== tabId) return;
          setPromptMessage(event.payload.prompt_message);
          setPassword("");
          pendingPasswordRef.current = null;
          setStatus("waiting_auth");
        },
      ),
      listen<{ tab_id: string }>("passphrase_required", (event) => {
        if (event.payload.tab_id !== tabId) return;
        setPassphrase("");
        setStatus("waiting_passphrase");
      }),
      listen<{ tab_id: string }>("session_established", (event) => {
        if (event.payload.tab_id !== tabId) return;
        // Save the new password to keychain if the user entered one to fix auth.
        if (pendingPasswordRef.current && hostId) {
          invoke("secrets_set", {
            service: "nexum-app",
            account: hostId,
            password: pendingPasswordRef.current,
          }).catch(console.error);
          pendingPasswordRef.current = null;
        }
        onConnected();
      }),
    ]).then((unlisteners) => {
      unlisteners.forEach((u) => cleanups.push(u));
      if (!cancelled && !isQuickConnect) doConnect();
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, hostId]);

  const submitPassword = () => {
    pendingPasswordRef.current = password;
    doConnect(undefined, password);
    setPassword("");
  };

  // Host identity label shown above the card
  const identityLine = isQuickConnect
    ? `${quickConnect!.username}@${quickConnect!.hostAddress}:${quickConnect!.port}`
    : hostName
    ? hostName
    : undefined;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-background">
      {/* Host identity header */}
      {identityLine && (
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-xs font-medium text-foreground">{identityLine}</p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── Quick connect password ── */}
        {status === "quick_connect_password" && (
          <motion.div
            key="quick-pw"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex w-[400px] flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Connect to host</p>
              <p className="font-mono text-xs text-muted-foreground">
                {quickConnect!.username}@{quickConnect!.hostAddress}:{quickConnect!.port}
              </p>
            </div>
            <input
              type="password"
              value={quickPassword}
              onChange={(e) => setQuickPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { doConnect(undefined, quickPassword); }
              }}
              placeholder="Password"
              autoFocus
              className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary",
              )}
            />
            <div className="flex gap-2">
              <button
                onClick={() => doConnect(undefined, quickPassword)}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Connect
              </button>
              <button
                onClick={() => onError("User cancelled")}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Connecting ── */}
        {status === "connecting" && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-5"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />

            {/* Stage indicator */}
            <div className="flex items-center gap-0">
              {STAGES.map((label, i) => {
                const stepNum = i + 1;
                const done = currentStage > stepNum;
                const active = currentStage === stepNum;
                return (
                  <div key={label} className="flex items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full transition-colors",
                          done && "bg-primary",
                          active && "bg-primary animate-pulse",
                          !done && !active && "bg-muted",
                        )}
                      />
                      <span
                        className={cn(
                          "text-[10px] transition-colors",
                          (done || active) ? "text-foreground/70" : "text-muted-foreground/40",
                        )}
                      >
                        {label}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div
                        className={cn(
                          "mb-3 mx-2 h-px w-8 transition-colors",
                          done ? "bg-primary" : "bg-muted",
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => onError("User cancelled")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded border border-transparent hover:border-border"
            >
              Cancel
            </button>
          </motion.div>
        )}

        {/* ── Trust unknown / mismatched host ── */}
        {status === "waiting_trust" && (
          <motion.div
            key="trust"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className={cn(
              "flex w-[480px] flex-col gap-4 rounded-xl border bg-card p-6 shadow-lg",
              isMismatch ? "border-destructive/40" : "border-border",
            )}
          >
            <div className="flex flex-col gap-1">
              <p className={cn("text-sm font-medium", isMismatch ? "text-destructive" : "text-foreground")}>
                {isMismatch ? "⚠ Host key mismatch — possible MITM!" : "Unknown host — trust this server?"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isMismatch
                  ? "The host key for "
                  : "The authenticity of "}
                <span className="font-mono text-foreground">{host}</span>
                {isMismatch
                  ? " has changed since last connection."
                  : " can't be established."}
              </p>
            </div>
            <div className="rounded-lg bg-muted px-4 py-3">
              <p className="text-xs text-muted-foreground">Fingerprint (MD5)</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{fingerprint}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStatus("connecting");
                  invoke("ssh_trust_host", { tabId, accepted: true }).catch(console.error);
                }}
                className={cn(
                  "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-opacity",
                  isMismatch
                    ? "bg-destructive text-destructive-foreground hover:opacity-90"
                    : "bg-primary text-primary-foreground hover:opacity-90",
                )}
              >
                {isMismatch ? "Accept anyway" : "Trust & Connect"}
              </button>
              <button
                onClick={() => {
                  invoke("ssh_trust_host", { tabId, accepted: false }).catch(console.error);
                  onError("User aborted");
                }}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                Abort
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Auth required (wrong / missing password) ── */}
        {status === "waiting_auth" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex w-[400px] flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Authentication required</p>
              {promptMessage && (
                <p className="text-xs text-muted-foreground">{promptMessage}</p>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }}
              placeholder="Password"
              autoFocus
              className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary",
              )}
            />
            <div className="flex gap-2">
              <button
                onClick={submitPassword}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Submit
              </button>
              <button
                onClick={() => onError("User aborted")}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Passphrase for encrypted key ── */}
        {status === "waiting_passphrase" && (
          <motion.div
            key="passphrase"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex w-[400px] flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Key passphrase required</p>
              <p className="text-xs text-muted-foreground">
                Your private key is encrypted. Enter the passphrase to unlock it.
              </p>
            </div>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { doConnect(passphrase); setPassphrase(""); }
              }}
              placeholder="Key passphrase"
              autoFocus
              className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary",
              )}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { doConnect(passphrase); setPassphrase(""); }}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Unlock
              </button>
              <button
                onClick={() => onError("User aborted")}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Error ── */}
        {status === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex w-[420px] flex-col gap-4 rounded-xl border border-destructive/40 bg-card p-6 shadow-lg"
          >
            <p className="text-sm font-medium text-destructive">Connection failed</p>
            <p className="break-all text-xs text-muted-foreground">{errorMessage}</p>
            <div className="flex gap-2">
              <button
                onClick={() => doConnect()}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
              <button
                onClick={() => onError(errorMessage)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection log */}
      {logs.length > 0 && status !== "quick_connect_password" && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-[480px] rounded-lg border border-border bg-muted/30 overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground select-none">
              Connection Log
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto px-3 py-2 space-y-0.5">
            {logs.map((line, i) => (
              <p key={i} className="font-mono text-[11px] text-foreground/70 leading-relaxed">
                <span className="text-muted-foreground/40 mr-2 select-none">›</span>
                {line}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>
        </motion.div>
      )}
    </div>
  );
}
