import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  return "password";
}

export function CredentialListItem({
  credential,
  hostsCount,
  isSelected,
  onClick,
  onEdit,
  onDuplicate,
}: Props) {
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
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors",
          isSelected ? "bg-accent/60 ring-1 ring-inset ring-accent" : "hover:bg-accent/60",
        )}
      >
        {/* Icon */}
        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-muted text-muted-foreground">
          {credential.cred_type === "key" ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m21 2-9.6 9.6" />
              <path d="m15.5 7.5 3 3L22 7l-3-3" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{credential.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {credTypeLabel(credential)}
            {" · "}
            {hostsCount === 1 ? "1 host" : `${hostsCount} hosts`}
            {" · "}
            {relativeTime(credential.created_at)}
          </p>
        </div>

        {/* has_secret indicator */}
        {credential.has_secret && (
          <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-success" title="Secret stored" />
        )}

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <button className="shrink-0 flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
            >
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick();
              }}
            >
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{credential.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {affectedHosts.length > 0 ? (
                <>
                  The following {affectedHosts.length === 1 ? "host" : `${affectedHosts.length} hosts`} will
                  lose their credential reference and revert to no auth:
                  <ul className="mt-2 space-y-0.5 text-foreground">
                    {affectedHosts.map((h) => (
                      <li key={h.id} className="text-sm">
                        • {h.name}
                      </li>
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
