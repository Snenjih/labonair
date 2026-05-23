import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { isNexumError } from "@/types";

export function handleApiError(
  error: unknown,
  title: string = "An error occurred",
  source?: string,
) {
  console.error(`[Nexum Error - ${title}]:`, error);
  const message = isNexumError(error) ? error.message : String(error);
  useNotificationStore.getState().addNotification({
    type: "error",
    title,
    message,
    source,
  });
}
