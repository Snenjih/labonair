import { create } from "zustand";
import { usePreferencesStore } from "@/modules/settings/preferences";

export type NotificationType = "error" | "warning" | "info" | "success";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  source?: string;
  timestamp: number;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (notif: Omit<AppNotification, "id" | "timestamp">) => void;
  /** Like `addNotification`, but bypasses the `notifyOnErrors` gate — for
   *  direct, user-initiated action results (a button was just clicked and
   *  the action succeeded/failed) rather than passive/background errors,
   *  which is what that preference is meant to govern. Without this,
   *  action-result errors would be silently invisible for the majority of
   *  users, since `notifyOnErrors` defaults to off. */
  addActionResultNotification: (notif: Omit<AppNotification, "id" | "timestamp">) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

function pushNotification(
  set: (fn: (s: NotificationState) => Partial<NotificationState>) => void,
  get: () => NotificationState,
  notif: Omit<AppNotification, "id" | "timestamp">,
): void {
  const { notifications } = get();
  // Spam guard: ignore if newest notification has same message+type within 2s
  const newest = notifications[0];
  if (
    newest &&
    newest.message === notif.message &&
    newest.type === notif.type &&
    Date.now() - newest.timestamp < 2000
  ) {
    return;
  }
  set((s) => ({
    notifications: [{ ...notif, id: crypto.randomUUID(), timestamp: Date.now() }, ...s.notifications].slice(
      0,
      100,
    ),
  }));
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  addNotification: (notif) => {
    if (notif.type === "error" && !usePreferencesStore.getState().notifyOnErrors) {
      return;
    }
    pushNotification(set, get, notif);
  },
  addActionResultNotification: (notif) => {
    pushNotification(set, get, notif);
  },
  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
  clearAll: () => set({ notifications: [] }),
}));
