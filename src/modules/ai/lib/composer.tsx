import { handleApiError } from "@/lib/errors";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { invoke } from "@tauri-apps/api/core";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWhisperRecording } from "../hooks/useWhisperRecording";
import { expandDirectiveTokens, type Directive } from "../lib/directives";
import { tryRunSlashCommand, type SlashCommandMeta } from "./slashCommands";
import { getOrCreateChat, useChatStore } from "../store/chatStore";
import { useDirectivesStore } from "../store/directivesStore";

export type FileAttachment = {
  id: string;
  name: string;
  kind: "image" | "text" | "selection" | "ref";
  mediaType: string;
  url?: string;
  text?: string;
  size: number;
  /** Absolute path — only set for kind === "ref". */
  path?: string;
  /** For kind === "selection": which surface it came from. */
  source?: "terminal" | "editor";
};

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string; filename?: string };

export const MAX_TEXT_INLINE = 200_000;
export const ACCEPTED_FILES =
  "image/*,.txt,.md,.json,.yaml,.yml,.toml,.sh,.zsh,.bash,.py,.js,.jsx,.ts,.tsx,.rs,.go,.java,.c,.cpp,.h,.hpp,.html,.css,.csv,.log,.env,.config,.conf,.ini,Dockerfile,.dockerfile";

type Voice = ReturnType<typeof useWhisperRecording>;

type ComposerCtx = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  files: FileAttachment[];
  addFiles: (list: FileList | null) => Promise<void>;
  /** Attach a file by absolute path — used by the file explorer's "Attach to Agent". */
  attachFileByPath: (path: string) => Promise<void>;
  /** Add a file reference chip (no content read — agent will read_file itself). */
  addFileRef: (path: string) => void;
  removeFile: (id: string) => void;
  pickedDirectives: Directive[];
  addDirective: (d: Directive) => void;
  removeDirective: (id: string) => void;
  pickedCommands: SlashCommandMeta[];
  addCommand: (c: SlashCommandMeta) => void;
  removeCommand: (name: string) => void;
  isBusy: boolean;
  submit: () => void;
  stop: () => void;
  voice: Voice;
  canSend: boolean;
};

const Ctx = createContext<ComposerCtx | null>(null);

export function useComposer(): ComposerCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useComposer must be used inside <AiComposerProvider>");
  return ctx;
}

type ProviderProps = {
  children: React.ReactNode;
};

export function AiComposerProvider({ children }: ProviderProps) {
  const sessionId = useChatStore((s) => s.activeSessionId);
  const status = useChatStore((s) => s.agentMeta.status);
  const isBusy = status === "thinking" || status === "streaming";

  const [value, setValue] = useState("");
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [pickedDirectives, setPickedDirectives] = useState<Directive[]>([]);
  const [pickedCommands, setPickedCommands] = useState<SlashCommandMeta[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const focusSignal = useChatStore((s) => s.focusSignal);
  const pendingPrefill = useChatStore((s) => s.pendingPrefill);
  const consumePrefill = useChatStore((s) => s.consumePrefill);
  const pendingSelections = useChatStore((s) => s.pendingSelections);
  const consumeSelections = useChatStore((s) => s.consumeSelections);

  useEffect(() => {
    if (focusSignal === 0) return;
    textareaRef.current?.focus();
    if (pendingPrefill != null) {
      const text = consumePrefill();
      if (text) setValue((v) => (v ? `${text}${v}` : text));
    }
  }, [focusSignal, pendingPrefill, consumePrefill]);

  // Listen for explorer's "Attach to Agent" event.
  useEffect(() => {
    const onAttach = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string" && path.length > 0) {
        void attachFileByPath(path);
      }
    };
    window.addEventListener("nexum:ai-attach-file", onAttach);
    return () => window.removeEventListener("nexum:ai-attach-file", onAttach);
    // attachFileByPath is stable for our purposes (closes over setFiles only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingSelections.length === 0) return;
    const drained = consumeSelections();
    if (drained.length === 0) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.id));
      const next: FileAttachment[] = [];
      for (const sel of drained) {
        if (existing.has(sel.id)) continue;
        next.push({
          id: sel.id,
          name:
            sel.source === "editor"
              ? "Editor selection"
              : "Terminal selection",
          kind: "selection",
          mediaType: "text/plain",
          text: sel.text,
          size: sel.text.length,
          source: sel.source,
        });
      }
      return next.length ? [...prev, ...next] : prev;
    });
  }, [pendingSelections, consumeSelections]);

  const voice = useWhisperRecording({
    onResult: (transcript: string) => {
      setValue((v) => (v ? `${v} ${transcript}` : transcript));
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  });

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: FileAttachment[] = [];
    for (const f of Array.from(list)) {
      const att = await readAttachment(f);
      if (att) next.push(att);
    }
    if (next.length) setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (id: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== id));

  const addDirective = (d: Directive) =>
    setPickedDirectives((prev) =>
      prev.some((p) => p.id === d.id) ? prev : [...prev, d],
    );
  const removeDirective = (id: string) =>
    setPickedDirectives((prev) => prev.filter((d) => d.id !== id));

  const addCommand = (cmd: SlashCommandMeta) =>
    setPickedCommands((prev) =>
      prev.some((p) => p.name === cmd.name) ? prev : [...prev, cmd],
    );
  const removeCommand = (name: string) =>
    setPickedCommands((prev) => prev.filter((c) => c.name !== name));

  const attachFileByPath = async (path: string) => {
    try {
      type ReadResult =
        | { kind: "text"; content: string; size: number }
        | { kind: "binary"; size: number }
        | { kind: "toolarge"; size: number; limit: number };
      const result = await invoke<ReadResult>("fs_read_file", { path });
      if (result.kind !== "text") {
        const msg =
          result.kind === "toolarge"
            ? `File too large (limit: ${Math.round((result as { limit: number }).limit / 1024)}KB)`
            : "Binary files cannot be attached";
        useNotificationStore.getState().addNotification({
          type: "warning",
          title: "Cannot attach file",
          message: msg,
          source: "Attachment",
        });
        return;
      }
      const name = path.split("/").pop() || path;
      const id = `path-${path}`;
      setFiles((prev) => {
        if (prev.some((f) => f.id === id)) return prev;
        const att: FileAttachment = {
          id,
          name,
          kind: "text",
          mediaType: "text/plain",
          text: result.content,
          size: result.size,
        };
        return [...prev, att];
      });
      // Open the AI panel & focus the input so the user sees the chip.
      useChatStore.getState().focusInput();
    } catch (e) {
      handleApiError(e, "Failed to attach file", "Attachment");
    }
  };

  const addFileRef = (path: string) => {
    const name = path.split("/").pop() || path;
    const id = `ref-${path}`;
    setFiles((prev) => {
      if (prev.some((f) => f.id === id)) return prev;
      return [
        ...prev,
        { id, name, kind: "ref", mediaType: "text/plain", path, size: 0 },
      ];
    });
    useChatStore.getState().focusInput();
  };

  const submit = () => {
    if (isBusy) return;
    const trimmed = value.trim();
    if (
      !trimmed &&
      files.length === 0 &&
      pickedDirectives.length === 0 &&
      pickedCommands.length === 0
    )
      return;

    useChatStore.getState().openMini();

    // Slash-command interception. `/plan` toggles plan mode; `/init` rewrites
    // the prompt to the NEXUM.md scan template before sending.
    let effectiveText = trimmed;
    let commandMarker: string | null = null;
    let commandSource = trimmed;
    if (pickedCommands.length > 0 && !trimmed.startsWith("/") && !trimmed.startsWith("#")) {
      commandSource = `#${pickedCommands[0].name} ${trimmed}`.trim();
    }
    if (commandSource.startsWith("/") || commandSource.startsWith("#")) {
      const outcome = tryRunSlashCommand(commandSource);
      if (outcome.kind === "handled") {
        setValue("");
        if (outcome.toast) console.info(outcome.toast);
        return;
      }
      if (outcome.kind === "send-prompt") {
        effectiveText = outcome.prompt;
        if (outcome.commandName) {
          commandMarker = `<nexum-command name="${outcome.commandName}" />`;
        }
      }
    }

    const parts: MessagePart[] = [];
    const fileBlocks = files
      .filter((f) => f.kind === "text")
      .map(
        (f) =>
          `<file name="${f.name}" mediaType="${f.mediaType}">\n${f.text ?? ""}\n</file>`,
      );
    const refBlocks = files
      .filter((f) => f.kind === "ref")
      .map((f) => `<file-ref name="${f.name}" path="${f.path ?? f.name}" />`);
    const selectionBlocks = files
      .filter((f) => f.kind === "selection")
      .map(
        (f) =>
          `<selection source="${f.source ?? "terminal"}">\n${f.text ?? ""}\n</selection>`,
      );
    const { body: bodyAfterTokens, blocks: directiveBlocks } = expandDirectiveTokens(
      effectiveText,
      useDirectivesStore.getState().directives,
    );
    const seenHandles = new Set<string>();
    const allDirectiveBlocks: string[] = [];
    for (const d of pickedDirectives) {
      if (seenHandles.has(d.handle)) continue;
      seenHandles.add(d.handle);
      allDirectiveBlocks.push(
        `<directive name="${d.handle}">\n${d.content}\n</directive>`,
      );
    }
    for (const block of directiveBlocks) {
      const m = block.match(/^<directive name="([^"]+)"/);
      if (m && seenHandles.has(m[1])) continue;
      if (m) seenHandles.add(m[1]);
      allDirectiveBlocks.push(block);
    }
    const composed = [
      commandMarker ?? "",
      allDirectiveBlocks.join("\n\n"),
      selectionBlocks.join("\n\n"),
      fileBlocks.join("\n\n"),
      refBlocks.join("\n"),
      bodyAfterTokens,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (composed) parts.push({ type: "text", text: composed });

    for (const f of files) {
      if (f.kind === "image" && f.url) {
        parts.push({
          type: "file",
          mediaType: f.mediaType,
          url: f.url,
          filename: f.name,
        });
      }
    }

    if (!sessionId) return;
    const chat = getOrCreateChat(sessionId);
    void chat.sendMessage({ role: "user", parts } as Parameters<
      typeof chat.sendMessage
    >[0]);
    setValue("");
    setFiles([]);
    setPickedDirectives([]);
    setPickedCommands([]);
  };

  const stop = () => {
    if (!sessionId) return;
    void getOrCreateChat(sessionId).stop();
  };

  const canSend =
    !isBusy &&
    (value.trim().length > 0 ||
      files.length > 0 ||
      pickedDirectives.length > 0 ||
      pickedCommands.length > 0);

  const ctx: ComposerCtx = {
    textareaRef,
    value,
    setValue,
    files,
    addFiles,
    attachFileByPath,
    addFileRef,
    removeFile,
    pickedDirectives,
    addDirective,
    removeDirective,
    pickedCommands,
    addCommand,
    removeCommand,
    isBusy,
    submit,
    stop,
    voice,
    canSend,
  };

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

async function readAttachment(file: File): Promise<FileAttachment | null> {
  const id = `${file.name}-${file.size}-${file.lastModified}`;
  if (file.type.startsWith("image/")) {
    const url = await readAsDataURL(file);
    return {
      id,
      name: file.name,
      kind: "image",
      mediaType: file.type || "image/png",
      url,
      size: file.size,
    };
  }
  if (file.size > MAX_TEXT_INLINE) return null;
  const text = await file.text();
  return {
    id,
    name: file.name,
    kind: "text",
    mediaType: file.type || "text/plain",
    text,
    size: file.size,
  };
}

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
