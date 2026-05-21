export interface TunnelConfig {
  id: string;
  type: "local";
  local_port: number;
  remote_host: string;
  remote_port: number;
}

export interface Host {
  id: string;
  name: string;
  host_address: string;
  port: number;
  username: string;
  auth_method: "password" | "key" | "none";
  private_key_path?: string;
  group_id?: string;
  tags?: string;
  created_at: number;
  last_connected_at?: number;
  // New fields
  default_path_ssh?: string;
  default_path_sftp?: string;
  pin_to_top: boolean;
  sudo_password_set: boolean;
  keep_alive_interval?: number;
  keep_alive_tries?: number;
  sort_order: number;
  tunnels?: string;
  startup_snippet_id?: string | null;
  startup_snippet_mode?: "execute" | "inject" | null;
}

export interface Group {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  created_at: number;
}

export interface CreateHostPayload {
  name: string;
  host_address: string;
  port: number;
  username: string;
  auth_method: "password" | "key" | "none";
  private_key_path?: string;
  group_id?: string;
  tags?: string;
  password?: string;
  sudo_password?: string;
  default_path_ssh?: string;
  default_path_sftp?: string;
  pin_to_top?: boolean;
  keep_alive_interval?: number;
  keep_alive_tries?: number;
  sort_order?: number;
  tunnels?: string;
  startup_snippet_id?: string | null;
  startup_snippet_mode?: string;
}

export interface UpdateHostPayload extends Partial<CreateHostPayload> {
  id: string;
}

export interface ReorderItem {
  id: string;
  sort_order: number;
}
