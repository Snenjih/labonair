import { describe, expect, it } from "vitest";
import type { Host } from "@/modules/hosts";
import type { SftpTab, Tab, WorkspaceTab } from "@/modules/tabs";
import type { PathBookmark } from "../store/pathBookmarksStore";
import { filterBookmarksForContext } from "./filterBookmarksForContext";

const HOST_A: Host = { id: "host-a", name: "Prod A" } as Host;
const HOST_B: Host = { id: "host-b", name: "Prod B" } as Host;
const HOSTS = [HOST_A, HOST_B];

function bm(overrides: Partial<PathBookmark> = {}): PathBookmark {
  return { id: crypto.randomUUID(), path: "/foo", ...overrides };
}

function localWorkspaceTab(overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return {
    id: 1,
    kind: "workspace",
    title: "term",
    activePaneId: "pane-1",
    layout: { type: "pane", id: "pane-1" },
    sessions: { "pane-1": { id: "pane-1", kind: "local", title: "local" } },
    ...overrides,
  };
}

function sshWorkspaceTab(hostId: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return {
    id: 2,
    kind: "workspace",
    title: "ssh",
    activePaneId: "pane-1",
    layout: { type: "pane", id: "pane-1" },
    sessions: { "pane-1": { id: "pane-1", kind: "ssh", title: "ssh", hostId } },
    ...overrides,
  };
}

function sftpTab(hostId: string, overrides: Partial<SftpTab> = {}): SftpTab {
  return { id: 3, kind: "sftp", title: "sftp", hostId, ...overrides };
}

const BOOKMARKS: PathBookmark[] = [
  bm({ id: "local-1", path: "/home/me", hostId: undefined }),
  bm({ id: "a-1", path: "/var/www", hostId: "host-a" }),
  bm({ id: "a-2", path: "/etc/nginx", hostId: "host-a" }),
  bm({ id: "b-1", path: "/srv", hostId: "host-b" }),
  bm({ id: "orphan-1", path: "/opt", hostId: "host-deleted" }),
];

describe("filterBookmarksForContext", () => {
  it("shows only local bookmarks for a local terminal pane", () => {
    const result = filterBookmarksForContext(localWorkspaceTab(), BOOKMARKS, HOSTS);
    expect(result.mode).toBe("single");
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].bookmarks.map((b) => b.id)).toEqual(["local-1"]);
  });

  it("shows all bookmarks for host A when an ssh terminal to host A is active", () => {
    const result = filterBookmarksForContext(sshWorkspaceTab("host-a"), BOOKMARKS, HOSTS);
    expect(result.mode).toBe("single");
    expect(result.sections[0].bookmarks.map((b) => b.id)).toEqual(["a-1", "a-2"]);
  });

  it("shows only host B bookmarks when an ssh terminal to host B is active", () => {
    const result = filterBookmarksForContext(sshWorkspaceTab("host-b"), BOOKMARKS, HOSTS);
    expect(result.sections[0].bookmarks.map((b) => b.id)).toEqual(["b-1"]);
  });

  it("resolves against the active PANE, not the tab, for a local+ssh split", () => {
    const splitTab: WorkspaceTab = {
      id: 4,
      kind: "workspace",
      title: "split",
      activePaneId: "pane-b",
      layout: {
        type: "split",
        id: "split-1",
        direction: "horizontal",
        sizes: [50, 50],
        children: [
          { type: "pane", id: "pane-a" },
          { type: "pane", id: "pane-b" },
        ],
      },
      sessions: {
        "pane-a": { id: "pane-a", kind: "local", title: "local" },
        "pane-b": { id: "pane-b", kind: "ssh", title: "ssh", hostId: "host-b" },
      },
    };
    const result = filterBookmarksForContext(splitTab, BOOKMARKS, HOSTS);
    expect(result.sections[0].bookmarks.map((b) => b.id)).toEqual(["b-1"]);
  });

  it("shows host bookmarks (either origin) AND local bookmarks in two sections for an sftp tab", () => {
    const result = filterBookmarksForContext(sftpTab("host-a"), BOOKMARKS, HOSTS);
    expect(result.mode).toBe("sftp-split");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].bookmarks.map((b) => b.id)).toEqual(["a-1", "a-2"]);
    expect(result.sections[1].bookmarks.map((b) => b.id)).toEqual(["local-1"]);
  });

  it("falls back to the full list, grouped, when the active tab has no path context", () => {
    const homeTab: Tab = { id: 5, kind: "home", title: "Home" };
    const result = filterBookmarksForContext(homeTab, BOOKMARKS, HOSTS);
    expect(result.mode).toBe("fallback");
    const titles = result.sections.map((s) => s.title);
    expect(titles).toContain("Local");
    expect(titles).toContain("Prod A");
    expect(titles).toContain("Prod B");
  });

  it("never drops an orphaned bookmark in the fallback view — labels it 'Unknown host'", () => {
    const result = filterBookmarksForContext(undefined, BOOKMARKS, HOSTS);
    const orphanSection = result.sections.find((s) => s.bookmarks.some((b) => b.id === "orphan-1"));
    expect(orphanSection?.title).toBe("Unknown host");
  });
});
