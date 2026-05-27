import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import type { Credential, HostRef } from "../types";
import { useCredentialsStore } from "../store/credentialsStore";

interface Props {
  credential: Credential;
  hostsCount: number;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function credTypeLabel(cred: Credential): string {
  if (cred.cred_type === "key") {
    return cred.key_type ? `${cred.key_type} key` : "SSH key";
  }
  return "Password";
}

function initials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CredentialCard({ credential, hostsCount, isSelected, onClick, onEdit, onDuplicate }: Props) {
  const deleteCredential = useCredentialsStore((s) => s.deleteCredential);
  const getHostsUsing = useCredentialsStore((s) => s.getHostsUsing);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [affectedHosts, setAffectedHosts] = useState<HostRef[]>([]);

  async function handleDeleteClick() {
    const hosts = await getHostsUsing(credential.id);
    setAffectedHosts(hosts);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    await deleteCredential(credential.id);
    setDeleteOpen(false);
  }

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col justify-between rounded-xl border transition-all select-none",
          isSelected
            ? "border-accent ring-1 ring-accent bg-card/60 shadow-sm"
            : "border-border/60 bg-card/40 hover:border-foreground/30 hover:bg-card",
        )}
      >
        {/* ZONE A: Info Body */}
        <button
          onClick={onClick}
          onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="flex flex-1 items-start gap-3 p-3.5 text-left outline-none"
        >
          {/* Avatar */}
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/40 text-sm font-semibold text-muted-foreground shadow-sm">
            {initials(credential.name) || "?"}
            {/* Secret stored dot */}
            {credential.has_secret && (
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-success [box-shadow:0_0_6px_color-mix(in_oklch,var(--color-success)_70%,transparent)]" title="Secret stored" />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
              {credential.name}
            </span>
            {/* Type badge */}
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              {credential.cred_type === "key" ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="7.5" cy="15.5" r="5.5"/>
                  <path d="m21 2-9.6 9.6"/>
                  <path d="m15.5 7.5 3 3L22 7l-3-3"/>
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              )}
              <span className="truncate">{credTypeLabel(credential)}</span>
            </span>
            <span className="mt-1.5 text-[10px] text-muted-foreground/70">
              {hostsCount === 1 ? "Used by 1 host" : hostsCount > 0 ? `Used by ${hostsCount} hosts` : "Not used"}
              {" · "}
              {relativeTime(credential.created_at)}
            </span>
          </div>
        </button>

        {/* ZONE B: Action Footer */}
        <div
          className={cn(
            "flex items-center gap-1.5 border-t px-2 py-2 transition-colors",
            isSelected
              ? "border-border/80 bg-muted/20"
              : "border-border/40 bg-muted/10 group-hover:bg-muted/20",
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="h-9 flex-1 gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-background/50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground hover:bg-background/50"
              >
                ⋮
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDeleteClick}
              >
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{credential.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {affectedHosts.length > 0 ? (
                <>
                  The following {affectedHosts.length === 1 ? "host" : `${affectedHosts.length} hosts`} will lose their
                  credential reference and revert to no auth:
                  <ul className="mt-2 space-y-0.5 text-foreground">
                    {affectedHosts.map((h) => (
                      <li key={h.id} className="text-sm">• {h.name}</li>
                    ))}
                  </ul>
                  <span className="mt-2 block">This action cannot be undone.</span>
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
