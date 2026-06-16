import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "./useNotificationStore";

// Reset store state between tests
beforeEach(() => {
  useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const baseNotif = {
  type: "info" as const,
  title: "Test",
  message: "Hello",
};

describe("addNotification", () => {
  it("adds a new notification", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1" as ReturnType<typeof crypto.randomUUID>);
    useNotificationStore.getState().addNotification(baseNotif);
    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe("Hello");
    expect(notifications[0].id).toBe("uuid-1");
  });

  it("prepends new notifications (newest first)", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("uuid-1" as ReturnType<typeof crypto.randomUUID>)
      .mockReturnValueOnce("uuid-2" as ReturnType<typeof crypto.randomUUID>);

    useNotificationStore.getState().addNotification({ ...baseNotif, message: "First" });
    useNotificationStore.getState().addNotification({ ...baseNotif, message: "Second" });

    const { notifications } = useNotificationStore.getState();
    expect(notifications[0].message).toBe("Second");
    expect(notifications[1].message).toBe("First");
  });

  it("assigns a timestamp", () => {
    const before = Date.now();
    useNotificationStore.getState().addNotification(baseNotif);
    const after = Date.now();
    const { notifications } = useNotificationStore.getState();
    expect(notifications[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(notifications[0].timestamp).toBeLessThanOrEqual(after);
  });

  it("spam guard: blocks duplicate within 2 seconds", () => {
    const now = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    useNotificationStore.getState().addNotification(baseNotif);
    // Same message+type within 2s — should be blocked
    useNotificationStore.getState().addNotification(baseNotif);

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("spam guard: allows duplicate after 2 seconds have passed", () => {
    const dateSpy = vi.spyOn(Date, "now");
    dateSpy.mockReturnValue(1000000);
    useNotificationStore.getState().addNotification(baseNotif);

    // Advance time by 2001ms
    dateSpy.mockReturnValue(1002001);
    useNotificationStore.getState().addNotification(baseNotif);

    expect(useNotificationStore.getState().notifications).toHaveLength(2);
  });

  it("spam guard: does not block different messages", () => {
    const now = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    useNotificationStore.getState().addNotification({ ...baseNotif, message: "First" });
    useNotificationStore.getState().addNotification({ ...baseNotif, message: "Second" });

    expect(useNotificationStore.getState().notifications).toHaveLength(2);
  });

  it("spam guard: does not block different types", () => {
    const now = 1000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    useNotificationStore.getState().addNotification({ ...baseNotif, type: "info" });
    useNotificationStore.getState().addNotification({ ...baseNotif, type: "error" });

    expect(useNotificationStore.getState().notifications).toHaveLength(2);
  });

  it("limits to 100 notifications", () => {
    for (let i = 0; i < 105; i++) {
      useNotificationStore.getState().addNotification({ ...baseNotif, message: `msg-${i}` });
    }
    expect(useNotificationStore.getState().notifications).toHaveLength(100);
  });
});

describe("removeNotification", () => {
  it("removes a notification by id", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1" as ReturnType<typeof crypto.randomUUID>);
    useNotificationStore.getState().addNotification(baseNotif);
    useNotificationStore.getState().removeNotification("uuid-1");
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("does nothing when id not found", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1" as ReturnType<typeof crypto.randomUUID>);
    useNotificationStore.getState().addNotification(baseNotif);
    useNotificationStore.getState().removeNotification("non-existent");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});

describe("clearAll", () => {
  it("empties the notifications list", () => {
    useNotificationStore.getState().addNotification(baseNotif);
    useNotificationStore.getState().addNotification({ ...baseNotif, message: "Another" });
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
