import type { CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { historyList } from "./history";

export function historyPopoverSource(): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    // Only activate on explicit trigger (e.g. Ctrl+Space / arrow-up intent)
    if (!ctx.explicit) return null;
    const prefix = ctx.state.doc.toString().trim();
    const items = await historyList(prefix, 20);
    if (items.length === 0) return null;
    return {
      from: 0,
      to: ctx.state.doc.length,
      options: items.map((cmd) => ({
        label: cmd,
        type: "text",
        boost: 1,
      })),
    };
  };
}
