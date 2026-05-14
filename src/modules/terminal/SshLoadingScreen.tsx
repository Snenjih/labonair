import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface Props {
  tabId: string;
  hostId: string;
  onConnected: () => void;
  onError: (message: string) => void;
}

type Status = "connecting" | "waiting_trust" | "waiting_auth" | "waiting_passphrase" | "error";

export function SshLoadingScreen({ tabId, hostId, onConnected, onError }: Props) {
  const [status, setStatus] = useState<Status>("connecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [host, setHost] = useState("");
  const [promptMessage, setPromptMessage] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isMismatch, setIsMismatch] = useState(false);
  const connectingRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const pushLog = (msg: string) =>
    setLogs((prev) => [...prev, msg]);

  const doConnect = (passphraseArg?: string) => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setStatus("connecting");
    if (!passphraseArg) setLogs([]);
    invoke("ssh_connect", { tabId, hostId, passphrase: passphraseArg ?? null })
      .then(() => {
        console.log("[ssh] ssh_connect resolved for tab", tabId);
      })
      .catch((err: unknown) => {
        const msg = String(err);
        console.error("[ssh] ssh_connect error for tab", tabId, msg);
        if (msg.includes("mismatch") || msg.includes("passphrase_required")) return;
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
          setStatus("waiting_auth");
        },
      ),
      listen<{ tab_id: string }>("passphrase_required", (event) => {
        if (event.payload.tab_id !== tabId) return;
        setPassphrase("");
        setStatus("waiting_passphrase");
      }),
      listen<{ tab_id: string }>("session_established", (event) => {
        console.log("[ssh] session_established event", event.payload, "tabId=", tabId);
        if (event.payload.tab_id !== tabId) return;
        onConnected();
      }),
    ]).then((unlisteners) => {
      unlisteners.forEach((u) => cleanups.push(u));
      if (!cancelled) doConnect();
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, hostId]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-background">
      <AnimatePresence mode="wait">
        {status === "connecting" && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="text-sm text-muted-foreground">Connecting to host…</p>
          </motion.div>
        )}

        {status === "waiting_trust" && (
          <motion.div
            key="trust"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex w-[480px] flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Unknown host — trust this server?
              </p>
              <p className="text-xs text-muted-foreground">
                The authenticity of{" "}
                <span className="font-mono text-foreground">{host}</span> can&apos;t be
                established.
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
                  // For a key mismatch the backend already returned an error, so
                  // we must retry.  For an unknown host (not mismatch) the backend
                  // connection is still in progress — session_established will fire
                  // and call onConnected() once the session is ready.
                  if (isMismatch) doConnect();
                }}
                className={cn(
                  "flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                  "hover:opacity-90 transition-opacity",
                )}
              >
                Trust &amp; Connect
              </button>
              <button
                onClick={() => onError("User aborted")}
                className={cn(
                  "flex-1 rounded-lg border border-border px-4 py-2 text-sm text-foreground",
                  "hover:bg-accent transition-colors",
                )}
              >
                Abort
              </button>
            </div>
          </motion.div>
        )}

        {status === "waiting_auth" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="flex w-[400px] flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <p className="text-sm font-medium text-foreground">Authentication required</p>
            <p className="text-xs text-muted-foreground">{promptMessage}</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  invoke("ssh_pty_write", { tabId, data: password + "\n" }).catch(console.error);
                  setPassword("");
                  setStatus("connecting");
                }
              }}
              placeholder="Password"
              autoFocus
              className={cn(
                "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary",
              )}
            />
            <button
              onClick={() => {
                invoke("ssh_pty_write", { tabId, data: password + "\n" }).catch(console.error);
                setPassword("");
                setStatus("connecting");
              }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Submit
            </button>
          </motion.div>
        )}

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
                if (e.key === "Enter") {
                  doConnect(passphrase);
                  setPassphrase("");
                }
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

      {/* Connection log — always shown while connecting or after error */}
      {logs.length > 0 && (
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
