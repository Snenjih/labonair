import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { handleApiError } from "@/lib/errors";
import { useHostsStore } from "@/modules/hosts";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useWhisperRecording } from "../hooks/useWhisperRecording";
import { type Directive, expandDirectiveTokens } from "../lib/directives";
import { getOrCreateChat, useChatStore } from "../store/chatStore";
import { useDirectivesStore } from "../store/directivesStore";
import {
  type AiAttachFileDetail,
  ComposerContext,
  type ComposerCtx,
  type FileAttachment,
} from "./composerContext";
import { type SlashCommandMeta, tryRunSlashCommand } from "./slashCommands";

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string; filename?: string };

const MAX_TEXT_INLINE = 200_000;

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

  // Listen for explorer's "Attach to Agent" / breadcrumb's "Reference in AI
  // chat" events.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attachFileByPath is stable (closes over setFiles only)
  useEffect(() => {
    const onAttach = (e: Event) => {
      const detail = (e as CustomEvent<AiAttachFileDetail>).detail;
      if (!detail?.path) return;
      const remote =
        detail.sessionId && detail.hostId
          ? { sessionId: detail.sessionId, hostId: detail.hostId }
          : undefined;
      void attachFileByPath(detail.path, remote);
    };
    window.addEventListener("labonair:ai-attach-file", onAttach);
    return () => window.removeEventListener("labonair:ai-attach-file", onAttach);
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
          name: sel.source === "editor" ? "Editor selection" : "Terminal selection",
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

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const addDirective = (d: Directive) =>
    setPickedDirectives((prev) => (prev.some((p) => p.id === d.id) ? prev : [...prev, d]));
  const removeDirective = (id: string) => setPickedDirectives((prev) => prev.filter((d) => d.id !== id));

  const addCommand = (cmd: SlashCommandMeta) =>
    setPickedCommands((prev) => (prev.some((p) => p.name === cmd.name) ? prev : [...prev, cmd]));
  const removeCommand = (name: string) => setPickedCommands((prev) => prev.filter((c) => c.name !== name));

  const attachFileByPath = async (path: string, remote?: { sessionId: string; hostId: string }) => {
    try {
      type ReadResult =
        | { kind: "text"; content: string; size: number }
        | { kind: "binary"; size: number }
        | { kind: "toolarge"; size: number; limit: number };
      const result = remote
        ? await invoke<ReadResult>("sftp_read_file_content", {
            sessionId: remote.sessionId,
            remotePath: path,
            maxBytes: usePreferencesStore.getState().sftpMaxRemoteFileSizeMb * 1024 * 1024,
          })
        : await invoke<ReadResult>("fs_read_file", {
            path,
            maxBytes: usePreferencesStore.getState().editorMaxFileSizeMb * 1024 * 1024,
          });
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
      const hostLabel = remote
        ? (useHostsStore.getState().hosts.find((h) => h.id === remote.hostId)?.name ?? remote.hostId)
        : undefined;
      setFiles((prev) => {
        if (prev.some((f) => f.id === id)) return prev;
        const att: FileAttachment = {
          id,
          name,
          kind: "text",
          mediaType: "text/plain",
          text: result.content,
          size: result.size,
          source: hostLabel,
        };
        return [...prev, att];
      });
      // Open the AI panel & focus the input so the user sees the chip.
      useChatStore.getState().focusInput();
    } catch (e) {
      if (remote) {
        // Unlike the local case, there's no fallback ref-chip here — the
        // agent's own read_file tool is local-only and can't reach a
        // remote path later, so a failed remote attach is a dead end, not
        // a "read it another way" situation.
        handleApiError(e, "Failed to attach remote file", "Attachment");
        return;
      }
      // Directories can't be read as files — attach as a ref instead so the agent
      // can call list_directory on it.
      const msg = String(e);
      if (msg.includes("Is a directory") || msg.includes("os error 21")) {
        addFileRef(path);
        return;
      }
      handleApiError(e, "Failed to attach file", "Attachment");
    }
  };

  const addFileRef = (path: string) => {
    const name = path.split("/").pop() || path;
    const id = `ref-${path}`;
    setFiles((prev) => {
      if (prev.some((f) => f.id === id)) return prev;
      return [...prev, { id, name, kind: "ref", mediaType: "text/plain", path, size: 0 }];
    });
    useChatStore.getState().focusInput();
  };

  const submit = () => {
    if (isBusy) return;
    const trimmed = value.trim();
    if (!trimmed && files.length === 0 && pickedDirectives.length === 0 && pickedCommands.length === 0)
      return;

    useChatStore.getState().openMini();

    // Slash-command interception. `/plan` toggles plan mode; `/init` rewrites
    // the prompt to the LABONAIR.md scan template before sending.
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
          commandMarker = `<labonair-command name="${outcome.commandName}" />`;
        }
      }
    }

    const parts: MessagePart[] = [];
    const fileBlocks = files
      .filter((f) => f.kind === "text")
      .map((f) => `<file name="${f.name}" mediaType="${f.mediaType}">\n${f.text ?? ""}\n</file>`);
    const refBlocks = files
      .filter((f) => f.kind === "ref")
      .map((f) => `<file-ref name="${f.name}" path="${f.path ?? f.name}" />`);
    const selectionBlocks = files
      .filter((f) => f.kind === "selection")
      .map((f) => `<selection source="${f.source ?? "terminal"}">\n${f.text ?? ""}\n</selection>`);
    const { body: bodyAfterTokens, blocks: directiveBlocks } = expandDirectiveTokens(
      effectiveText,
      useDirectivesStore.getState().directives,
    );
    const seenHandles = new Set<string>();
    const allDirectiveBlocks: string[] = [];
    for (const d of pickedDirectives) {
      if (seenHandles.has(d.handle)) continue;
      seenHandles.add(d.handle);
      allDirectiveBlocks.push(`<directive name="${d.handle}">\n${d.content}\n</directive>`);
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
    void chat.sendMessage({ role: "user", parts } as Parameters<typeof chat.sendMessage>[0]);
    setValue("");
    setFiles([]);
    setPickedDirectives([]);
    setPickedCommands([]);
  };

  const stop = () => {
    if (!sessionId) return;
    void getOrCreateChat(sessionId).stop();
  };

  const queues = useChatStore((s) => s.queues);
  const queuedCount = sessionId ? (queues[sessionId]?.length ?? 0) : 0;

  const enqueue = () => {
    if (!sessionId) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const result = useChatStore.getState().enqueueMessage(sessionId, trimmed);
    if (result) {
      setValue("");
      setFiles([]);
      setPickedDirectives([]);
      setPickedCommands([]);
    }
  };

  const canSend =
    !isBusy &&
    (value.trim().length > 0 || files.length > 0 || pickedDirectives.length > 0 || pickedCommands.length > 0);

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
    enqueue,
    queuedCount,
    voice,
    canSend,
  };

  return <ComposerContext.Provider value={ctx}>{children}</ComposerContext.Provider>;
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
