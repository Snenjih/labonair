import { autocompletion } from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { historyList } from "./history";

export function historyPopoverExtension() {
  const historySource = async (
    ctx: CompletionContext,
  ): Promise<CompletionResult | null> => {
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

  return autocompletion({
    override: [historySource],
    activateOnTyping: false,
    closeOnBlur: true,
    maxRenderedOptions: 20,
  });
}
