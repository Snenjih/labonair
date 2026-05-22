export type KeyBinding = {
  key: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  displayKeys: string[];
};

export type KeyBindingOrDisabled = KeyBinding | null;
export type KeyBindingMap = Partial<Record<string, KeyBindingOrDisabled>>;
