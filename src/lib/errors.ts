import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { isLabonairError } from "@/types";

export function handleApiError(
  error: unknown,
  title: string = "An error occurred",
  source?: string,
) {
  console.error(`[Labonair Error - ${title}]:`, error);
  const message = isLabonairError(error) ? error.message : String(error);
  useNotificationStore.getState().addNotification({
    type: "error",
    title,
    message,
    source,
  });
}
