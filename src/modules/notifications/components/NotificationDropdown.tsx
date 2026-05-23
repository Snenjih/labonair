import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type AppNotification,
  type NotificationType,
  useNotificationStore,
} from "@/modules/notifications/store/useNotificationStore";
import {
  Alert02Icon,
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  InformationCircleIcon,
  Notification03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function TypeIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case "error":
      return (
        <HugeiconsIcon
          icon={AlertCircleIcon}
          size={14}
          className="mt-0.5 shrink-0 text-destructive"
        />
      );
    case "warning":
      return (
        <HugeiconsIcon
          icon={Alert02Icon}
          size={14}
          className="mt-0.5 shrink-0 text-yellow-500"
        />
      );
    case "success":
      return (
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          size={14}
          className="mt-0.5 shrink-0 text-green-500"
        />
      );
    case "info":
      return (
        <HugeiconsIcon
          icon={InformationCircleIcon}
          size={14}
          className="mt-0.5 shrink-0 text-blue-500"
        />
      );
  }
}

function NotificationItem({
  notif,
  onDismiss,
}: {
  notif: AppNotification;
  onDismiss: () => void;
}) {
  function handleCopy() {
    void navigator.clipboard.writeText(notif.message);
  }

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, overflow: "hidden", paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.18 }}
      className="flex flex-col gap-1 px-3 py-2.5"
    >
      <div className="flex min-w-0 items-start gap-2">
        <TypeIcon type={notif.type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold leading-tight">
              {notif.title}
            </span>
            {notif.source && (
              <Badge
                variant="secondary"
                className="shrink-0 px-1.5 py-0 text-[10px]"
              >
                {notif.source}
              </Badge>
            )}
          </div>
          <p className="mt-1 break-all rounded bg-muted/30 px-1.5 py-1 font-mono text-[11px] leading-snug text-muted-foreground">
            {notif.message}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between pl-5">
        <span className="text-[10px] text-muted-foreground">
          {relativeTime(notif.timestamp)}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            title="Copy error"
          >
            <HugeiconsIcon icon={Copy01Icon} size={11} />
            Copy
          </button>
          <button
            onClick={onDismiss}
            className="ml-1 text-muted-foreground transition-colors hover:text-foreground"
            title="Dismiss"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function NotificationDropdown() {
  const { notifications, removeNotification, clearAll } =
    useNotificationStore();

  if (notifications.length === 0) return null;

  const hasErrors = notifications.some((n) => n.type === "error");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Notifications"
        >
          <HugeiconsIcon icon={Notification03Icon} size={16} strokeWidth={1.75} />
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white",
              hasErrors ? "animate-pulse bg-destructive" : "bg-primary",
            )}
          >
            {notifications.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[100] flex max-h-[80vh] w-[380px] flex-col p-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        </div>
        <div className="flex-1 divide-y divide-border/40 overflow-y-auto">
          <AnimatePresence initial={false}>
            {notifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notif={notif}
                onDismiss={() => removeNotification(notif.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}
