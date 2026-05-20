import { invoke } from "@tauri-apps/api/core";

export type StoragePaths = { config: string; data: string };

let _promise: Promise<StoragePaths> | null = null;

export function getStoragePaths(): Promise<StoragePaths> {
  if (!_promise) {
    _promise = invoke<StoragePaths>("get_storage_paths");
  }
  return _promise;
}
