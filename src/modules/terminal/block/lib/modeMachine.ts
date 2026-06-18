// Pure state machine — no class, no xterm imports

export type BlockMode = "prompt" | "running" | "alt";

export type ModeState = {
  phase: "prompt" | "running";
  altScreen: boolean;
};

export function initialModeState(): ModeState {
  return { phase: "prompt", altScreen: false };
}

export type ModeEvent =
  | { type: "osc133"; code: "A" | "B" | "C" | "D" }
  | { type: "alt"; active: boolean };

export function reduceMode(state: ModeState, event: ModeEvent): ModeState {
  switch (event.type) {
    case "osc133": {
      const phase: "prompt" | "running" = event.code === "C" ? "running" : "prompt";
      if (phase === state.phase) return state;
      return { ...state, phase };
    }
    case "alt": {
      if (event.active === state.altScreen) return state;
      return { ...state, altScreen: event.active };
    }
  }
}

export function modeOf(state: ModeState): BlockMode {
  if (state.altScreen) return "alt";
  return state.phase;
}
