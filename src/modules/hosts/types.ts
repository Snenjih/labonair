export interface Host {
  id: string;
  name: string;
  host_address: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  private_key_path?: string;
  group_id?: string;
  tags?: string;
  created_at: number;
  last_connected_at?: number;
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
  auth_method: "password" | "key";
  private_key_path?: string;
  group_id?: string;
  tags?: string;
  password?: string;
}

export interface UpdateHostPayload extends Partial<CreateHostPayload> {
  id: string;
}
