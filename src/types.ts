export type NexumErrorCode =
  | "AuthFailed"
  | "NetworkError"
  | "HostKeyMismatch"
  | "IoError"
  | "Internal";

export interface NexumError {
  code: NexumErrorCode;
  message: string;
}

export function isNexumError(e: unknown): e is NexumError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "message" in e &&
    typeof (e as NexumError).code === "string" &&
    typeof (e as NexumError).message === "string"
  );
}
