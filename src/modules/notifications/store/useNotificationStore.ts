import { create } from "zustand";

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
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  addNotification: (notif) => {
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
      notifications: [
        { ...notif, id: crypto.randomUUID(), timestamp: Date.now() },
        ...s.notifications,
      ].slice(0, 100),
    }));
  },
  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
  clearAll: () => set({ notifications: [] }),
}));
