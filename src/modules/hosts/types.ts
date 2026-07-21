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
  auth_method: "password" | "key" | "none" | "credential";
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
  credential_id?: string;
  jump_host_id?: string | null;
  notes?: string;
  icon?: string | null;
  block_agent_access: boolean;
}

export interface Credential {
  id: string;
  name: string;
  cred_type: "password" | "key";
  key_path?: string;
  key_type?: string;
  public_key?: string;
  has_secret: boolean;
  created_at: number;
}

export interface CreateCredentialPayload {
  name: string;
  credType: "password" | "key";
  keyPath?: string;
  keyType?: string;
  publicKey?: string;
  secret?: string;
}

export interface UpdateCredentialPayload {
  id: string;
  name?: string;
  credType?: "password" | "key";
  keyPath?: string;
  keyType?: string;
  publicKey?: string;
  secret?: string;
}

export interface HostRef {
  id: string;
  name: string;
}

export interface GenerateKeypairResult {
  key_path: string;
  public_key: string;
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
  auth_method: "password" | "key" | "none" | "credential";
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
  credential_id?: string;
  jump_host_id?: string | null;
  notes?: string;
  icon?: string;
  block_agent_access?: boolean;
}

export interface UpdateHostPayload extends Partial<CreateHostPayload> {
  id: string;
}

export interface ReorderItem {
  id: string;
  sort_order: number;
}
