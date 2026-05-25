import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Tool } from "@/components/ai-elements/tool";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Copy01Icon, Tick02Icon, ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SLASH_COMMANDS, NEXUM_CMD_RE } from "../lib/slashCommands";
import { Spinner } from "@/components/ui/spinner";
import type {
  ChatStatus,
  DynamicToolUIPart,
  ToolUIPart,
  UIMessage,
  UIMessagePart,
} from "ai";
import { memo, useCallback, useEffect, useState } from "react";
import { AiToolApproval } from "./AiToolApproval";

function CommandSnippet({ name }: { name: string }) {
  const meta = SLASH_COMMANDS[name];
  if (!meta) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2 py-1 font-mono text-[11px]">
        /{name}
      </div>
    );
  }
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2 py-1">
      <HugeiconsIcon
        icon={meta.icon}
        size={12}
        strokeWidth={1.75}
        className="shrink-0 text-foreground"
      />
      <span className="font-mono text-[11px] text-foreground">
        {meta.invocation}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {meta.label}
      </span>
    </div>
  );
}

type AnyToolPart = ToolUIPart | DynamicToolUIPart;
type AnyPart = UIMessagePart<Record<string, never>, Record<string, never>>;

type ApprovalArg = {
  id: string;
  approved: boolean;
  reason?: string;
};

type Props = {
  messages: UIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  clearError: () => void;
  addToolApprovalResponse: (arg: ApprovalArg) => void | PromiseLike<void>;
  stop: () => void | PromiseLike<void>;
  reload?: () => unknown;
};

export function AiChatView({
  messages,
  status,
  error,
  clearError,
  addToolApprovalResponse,
  reload,
}: Props) {
  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const showSpinner = isBusy && lastMessage?.role === "user";

  const onApproval = useCallback(
    (id: string, approved: boolean) => addToolApprovalResponse({ id, approved }),
    [addToolApprovalResponse],
  );

  if (messages.length === 0) {
    return (
      <Conversation>
        <ConversationContent>
          <ConversationEmptyState
            title="Ask Nexum anything"
            description="Explain command output, fix errors, generate snippets, or run a task."
          />
        </ConversationContent>
      </Conversation>
    );
  }

  return (
    <Conversation>
      <ConversationContent className="gap-5 p-3">
        {messages.map((m, i) => (
          <RenderedMessage
            key={m.id}
            message={m}
            onApproval={onApproval}
            isStreaming={isBusy && i === messages.length - 1}
          />
        ))}
        {showSpinner && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            Thinking…
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <div className="font-medium">Something went wrong.</div>
            <div className="mt-0.5 leading-relaxed opacity-90">
              {error.message}
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              {reload && (
                <button
                  type="button"
                  onClick={() => { clearError(); void reload(); }}
                  className="font-medium underline opacity-80 hover:opacity-100"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={clearError}
                className="underline opacity-60 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

type Segment =
  | { kind: "text"; part: AnyPart; idx: number }
  | { kind: "reasoning"; part: AnyPart; idx: number }
  | { kind: "tool-group"; parts: AnyToolPart[]; firstIdx: number }
  | { kind: "approval"; part: AnyToolPart; idx: number };

function segmentParts(parts: AnyPart[]): Segment[] {
  const segments: Segment[] = [];
  let toolGroup: AnyToolPart[] = [];
  let toolGroupFirstIdx = -1;

  const flushGroup = () => {
    if (toolGroup.length > 0) {
      segments.push({ kind: "tool-group", parts: toolGroup, firstIdx: toolGroupFirstIdx });
      toolGroup = [];
      toolGroupFirstIdx = -1;
    }
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isToolPart =
      part.type === "dynamic-tool" ||
      (typeof part.type === "string" && part.type.startsWith("tool-"));

    if (isToolPart) {
      const tp = part as AnyToolPart;
      if (tp.state === "approval-requested") {
        flushGroup();
        segments.push({ kind: "approval", part: tp, idx: i });
      } else {
        if (toolGroup.length === 0) toolGroupFirstIdx = i;
        toolGroup.push(tp);
      }
    } else {
      flushGroup();
      if (part.type === "reasoning") {
        segments.push({ kind: "reasoning", part, idx: i });
      } else {
        segments.push({ kind: "text", part, idx: i });
      }
    }
  }
  flushGroup();
  return segments;
}

function ToolGroup({
  parts,
  onApproval,
}: {
  parts: AnyToolPart[];
  onApproval: (id: string, approved: boolean) => void;
}) {
  const isRunning = parts.some(
    (p) => p.state === "input-streaming" || p.state === "input-available",
  );
  const hasError = parts.some((p) => p.state === "output-error");
  const [open, setOpen] = useState(isRunning);

  useEffect(() => {
    if (isRunning) setOpen(true);
  }, [isRunning]);

  const statusDot = isRunning
    ? "bg-amber-500 animate-pulse"
    : hasError
      ? "bg-destructive"
      : "bg-transparent border border-muted-foreground/40";

  const statusLabel = isRunning ? "running" : hasError ? "error" : "done";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
        <HugeiconsIcon
          icon={open ? ArrowDown01Icon : ArrowRight01Icon}
          size={10}
          strokeWidth={2}
          className="shrink-0"
        />
        <span className={`size-1.5 shrink-0 rounded-full ${statusDot}`} />
        <span>
          {parts.length} tool{parts.length > 1 ? "s" : ""}
        </span>
        <span className="text-[10px] opacity-60">· {statusLabel}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-0.5 space-y-0.5">
        {parts.map((p, i) => (
          <RenderedTool key={i} part={p} onApproval={onApproval} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const RenderedMessage = memo(function RenderedMessage({
  message,
  onApproval,
  isStreaming = false,
}: {
  message: UIMessage;
  onApproval: (id: string, approved: boolean) => void;
  isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    const rawText = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");

    const cmdMatch = rawText.match(NEXUM_CMD_RE);
    const commandName = cmdMatch?.[1] ?? null;
    const text = cmdMatch ? rawText.slice(cmdMatch[0].length) : rawText;

    return (
      <Message from="user">
        <MessageContent>
          {commandName ? <CommandSnippet name={commandName} /> : null}
          {text ? (
            <p className="whitespace-pre-wrap wrap-break-word">{text}</p>
          ) : null}
        </MessageContent>
      </Message>
    );
  }

  const lastTextIdx = message.parts.reduce(
    (last, p, i) => (p.type === "text" ? i : last),
    -1,
  );

  const segments = segmentParts(message.parts as AnyPart[]);

  const copyMessage = () => {
    const text = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Message from={message.role}>
      <MessageContent>
        <div className="group relative flex flex-col gap-3">
          {segments.map((seg) => {
            if (seg.kind === "text") {
              return (
                <RenderedPart
                  key={`${message.id}-${seg.idx}`}
                  part={seg.part}
                  onApproval={onApproval}
                  isLastAndStreaming={isStreaming && seg.idx === lastTextIdx}
                />
              );
            }
            if (seg.kind === "reasoning") {
              return (
                <RenderedPart
                  key={`${message.id}-${seg.idx}`}
                  part={seg.part}
                  onApproval={onApproval}
                />
              );
            }
            if (seg.kind === "tool-group") {
              return (
                <ToolGroup
                  key={`${message.id}-tg-${seg.firstIdx}`}
                  parts={seg.parts}
                  onApproval={onApproval}
                />
              );
            }
            if (seg.kind === "approval") {
              return (
                <RenderedPart
                  key={`${message.id}-${seg.idx}`}
                  part={seg.part as AnyPart}
                  onApproval={onApproval}
                />
              );
            }
            return null;
          })}
          <button
            type="button"
            onClick={copyMessage}
            className="absolute -right-1 -top-0.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 hover:text-foreground group-hover:opacity-100"
            aria-label="Copy message"
            title="Copy"
          >
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              size={11}
              strokeWidth={1.75}
            />
          </button>
        </div>
      </MessageContent>
    </Message>
  );
});

const RenderedPart = memo(function RenderedPart({
  part,
  onApproval,
  isLastAndStreaming = false,
}: {
  part: AnyPart;
  onApproval: (id: string, approved: boolean) => void;
  isLastAndStreaming?: boolean;
}) {
  if (part.type === "text") {
    return (
      <MessageResponse isAnimating={isLastAndStreaming}>
        {(part as unknown as { text: string }).text}
      </MessageResponse>
    );
  }

  if (part.type === "reasoning") {
    return (
      <Reasoning>
        <ReasoningTrigger />
        <ReasoningContent>
          {(part as unknown as { text: string }).text}
        </ReasoningContent>
      </Reasoning>
    );
  }

  if (
    part.type === "dynamic-tool" ||
    (typeof part.type === "string" && part.type.startsWith("tool-"))
  ) {
    return (
      <RenderedTool
        part={part as unknown as AnyToolPart}
        onApproval={onApproval}
      />
    );
  }

  return null;
});

const RenderedTool = memo(function RenderedTool({
  part,
  onApproval,
}: {
  part: AnyToolPart;
  onApproval: (id: string, approved: boolean) => void;
}) {
  const toolName =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.replace(/^tool-/, "");

  if (part.state === "approval-requested") {
    return (
      <AiToolApproval
        part={part as Extract<ToolUIPart, { state: "approval-requested" }>}
        toolName={toolName}
        onRespond={(approved) => onApproval(part.approval.id, approved)}
      />
    );
  }

  return (
    <Tool
      toolName={toolName}
      state={part.state}
      input={part.input}
      output={"output" in part ? part.output : undefined}
      errorText={"errorText" in part ? part.errorText : undefined}
    />
  );
});
