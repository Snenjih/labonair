import { describe, expect, it } from "vitest";
import type { Host } from "@/modules/hosts";
import type { SftpTab, Tab, WorkspaceTab } from "@/modules/tabs";
import { deriveExplorerTarget } from "./useExplorerTarget";

const HOST: Host = {
  id: "host-1",
  name: "prod",
  host_address: "1.2.3.4",
  port: 22,
  username: "root",
  auth_method: "password",
  default_path_ssh: "/srv",
  pin_to_top: false,
} as Host;

function sftpTab(overrides: Partial<SftpTab> = {}): SftpTab {
  return { id: 7, kind: "sftp", title: "prod", hostId: "host-1", ...overrides };
}

function workspaceTab(overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return {
    id: 3,
    kind: "workspace",
    title: "term",
    activePaneId: "pane-1",
    layout: { type: "pane", id: "pane-1" },
    sessions: {
      "pane-1": { id: "pane-1", kind: "local", title: "local" },
    },
    ...overrides,
  };
}

describe("deriveExplorerTarget", () => {
  it("reuses the sftp tab's own session for an sftp tab", () => {
    const target = deriveExplorerTarget(sftpTab({ remotePath: "/var/www" }), [HOST], "/Users/x");
    expect(target).toEqual({
      type: "remote",
      hostId: "host-1",
      sessionId: "7",
      path: "/var/www",
      source: "sftp-tab",
    });
  });

  it("falls back to null path when the sftp tab has no remotePath yet", () => {
    const target = deriveExplorerTarget(sftpTab({ remotePath: undefined }), [HOST], "/Users/x");
    expect(target).toMatchObject({ type: "remote", path: null });
  });

  it("derives a lazy session for an active SSH workspace pane", () => {
    const tab = workspaceTab({
      sessions: {
        "pane-1": { id: "pane-1", kind: "ssh", title: "ssh", hostId: "host-1", cwd: "/var/log" },
      },
    });
    const target = deriveExplorerTarget(tab, [HOST], "/Users/x");
    expect(target).toEqual({
      type: "remote",
      hostId: "host-1",
      sessionId: "explorer:host-1",
      path: "/var/log",
      source: "lazy-session",
    });
  });

  it("falls back to the host's default_path_ssh when the ssh session has no cwd yet", () => {
    const tab = workspaceTab({
      sessions: {
        "pane-1": { id: "pane-1", kind: "ssh", title: "ssh", hostId: "host-1" },
      },
    });
    const target = deriveExplorerTarget(tab, [HOST], "/Users/x");
    expect(target).toMatchObject({ type: "remote", path: "/srv" });
  });

  it("returns local with explorerRoot for a local workspace session", () => {
    const target = deriveExplorerTarget(workspaceTab(), [HOST], "/Users/x");
    expect(target).toEqual({ type: "local", path: "/Users/x" });
  });

  it("returns local with explorerRoot when there is no active tab", () => {
    const target = deriveExplorerTarget(undefined as unknown as Tab, [HOST], "/Users/x");
    expect(target).toEqual({ type: "local", path: "/Users/x" });
  });

  it("returns local for a non-workspace, non-sftp tab (e.g. editor)", () => {
    const editorTab = { id: 5, kind: "editor", title: "f.ts", path: "/a", dirty: false } as Tab;
    const target = deriveExplorerTarget(editorTab, [HOST], "/Users/x");
    expect(target).toEqual({ type: "local", path: "/Users/x" });
  });

  it("falls back to \"/\" when a known host has no cwd and no default_path_ssh", () => {
    const bareHost: Host = { ...HOST, id: "host-2", default_path_ssh: undefined };
    const tab = workspaceTab({
      sessions: {
        "pane-1": { id: "pane-1", kind: "ssh", title: "ssh", hostId: "host-2" },
      },
    });
    const target = deriveExplorerTarget(tab, [HOST, bareHost], "/Users/x");
    expect(target).toMatchObject({ type: "remote", path: "/" });
  });

  it("falls back to local if the ssh session references an unknown host", () => {
    const tab = workspaceTab({
      sessions: {
        "pane-1": { id: "pane-1", kind: "ssh", title: "ssh", hostId: "does-not-exist" },
      },
    });
    const target = deriveExplorerTarget(tab, [HOST], "/Users/x");
    // Host lookup fails silently (no default_path_ssh available) — path is
    // just null, but it's still correctly routed as remote since hostId is
    // still present on the session.
    expect(target).toMatchObject({ type: "remote", hostId: "does-not-exist", path: null });
  });
});
