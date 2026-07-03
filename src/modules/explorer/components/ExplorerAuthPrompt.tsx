import { Button } from "@/components/ui/button";
import { Alert02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LazySessionStatus } from "../lib/useLazyExplorerSession";

type Props = {
  status: LazySessionStatus;
  error: string | null;
  hostLabel: string;
  onReconnect: () => void;
  /** Opens a full SFTP tab for this host — that surface already has the full
   *  interactive credential/2FA/host-key-trust UI (SshLoadingScreen). The
   *  narrow sidebar deliberately doesn't duplicate that flow inline; it
   *  hands off to the tab instead. */
  onOpenSftpTab: () => void;
};

/**
 * Compact inline connecting/error state for the sidebar's lazy explorer
 * session — intentionally NOT a full-screen SshLoadingScreen (that overlay
 * makes sense for a dedicated terminal/SFTP tab, not a narrow sidebar panel
 * that shares space with everything else).
 */
export function ExplorerAuthPrompt({ status, error, hostLabel, onReconnect, onOpenSftpTab }: Props) {
  if (status === "connecting") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
        <div className="text-xs text-muted-foreground">Connecting to {hostLabel}…</div>
      </div>
    );
  }

  const isAuth = status === "auth_required";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={1.5} className="text-destructive" />
      <div className="space-y-1">
        <div className="text-xs font-medium text-foreground">
          {isAuth ? "Authentication needed" : "Connection failed"}
        </div>
        {error && <div className="text-[11px] text-muted-foreground break-words">{error}</div>}
      </div>
      <div className="flex flex-col gap-1.5 w-full">
        {isAuth ? (
          <Button size="sm" variant="secondary" onClick={onOpenSftpTab} className="w-full">
            Open SFTP tab to authenticate
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onReconnect} className="w-full">
            <HugeiconsIcon icon={RefreshIcon} size={12} strokeWidth={2} className="mr-1.5" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
