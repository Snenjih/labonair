import { createContext, useContext } from "react";
import type { useWhisperRecording } from "../hooks/useWhisperRecording";
import type { Directive } from "./directives";
import type { SlashCommandMeta } from "./slashCommands";

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
  /** For kind === "selection": which surface it came from. For a remote
   *  (kind === "text") attachment: the host's display name, for chip
   *  labeling — mirrors selection's `source` field. */
  source?: "terminal" | "editor" | string;
};

/** Detail shape for the `"labonair:ai-attach-file"` window event — dispatched
 *  by the explorer tree's "Attach to Agent" and the breadcrumb's "Reference
 *  in AI chat". `sessionId`/`hostId` are set when the path is on a remote
 *  host, so the content gets read over SFTP instead of the local filesystem. */
export type AiAttachFileDetail = { path: string; sessionId?: string; hostId?: string };

export const ACCEPTED_FILES =
  "image/*,.txt,.md,.json,.yaml,.yml,.toml,.sh,.zsh,.bash,.py,.js,.jsx,.ts,.tsx,.rs,.go,.java,.c,.cpp,.h,.hpp,.html,.css,.csv,.log,.env,.config,.conf,.ini,Dockerfile,.dockerfile";

type Voice = ReturnType<typeof useWhisperRecording>;

export type ComposerCtx = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  files: FileAttachment[];
  addFiles: (list: FileList | null) => Promise<void>;
  /** Attach a file by absolute path — used by the file explorer's "Attach to
   *  Agent" and the breadcrumb's "Reference in AI chat". `remote` reads the
   *  content over the given SSH session's SFTP connection instead of the
   *  local filesystem. */
  attachFileByPath: (path: string, remote?: { sessionId: string; hostId: string }) => Promise<void>;
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
  enqueue: () => void;
  queuedCount: number;
  voice: Voice;
  canSend: boolean;
};

export const ComposerContext = createContext<ComposerCtx | null>(null);

export function useComposer(): ComposerCtx {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used inside <AiComposerProvider>");
  return ctx;
}
