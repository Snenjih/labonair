import type { Compartment, Extension } from "@codemirror/state";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, type RefObject } from "react";

/**
 * Reconfigures a CodeMirror compartment whenever `extension` changes.
 * Avoids the boilerplate of 5 identical useEffect blocks in EditorPane.
 */
export function useCompartmentEffect(
  cmRef: RefObject<ReactCodeMirrorRef | null>,
  compartment: Compartment,
  extension: Extension,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dep: any,
) {
  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({ effects: compartment.reconfigure(extension) });
    // `dep` is the raw primitive that triggers the reconfiguration; `extension`
    // is derived from it and intentionally excluded from the dep array to
    // prevent stale-closure issues with compartment references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
}
