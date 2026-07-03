export type LabonairErrorCode = "AuthFailed" | "NetworkError" | "HostKeyMismatch" | "IoError" | "Internal";

export interface LabonairError {
  code: LabonairErrorCode;
  message: string;
}

export function isLabonairError(e: unknown): e is LabonairError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "message" in e &&
    typeof (e as LabonairError).code === "string" &&
    typeof (e as LabonairError).message === "string"
  );
}
