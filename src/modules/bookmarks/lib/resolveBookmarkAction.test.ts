import { describe, expect, it } from "vitest";
import type { SftpTab, WorkspaceTab } from "@/modules/tabs";
import type { PathBookmark } from "../store/pathBookmarksStore";
import { applicableActions, type EnabledActions, resolvePrimaryAction } from "./resolveBookmarkAction";

const ALL_ENABLED: EnabledActions = {
  "new-terminal": true,
  "current-terminal": true,
  "current-sftp": true,
  "new-sftp": true,
};

const ALL_DISABLED: EnabledActions = {
  "new-terminal": false,
  "current-terminal": false,
  "current-sftp": false,
  "new-sftp": false,
};

function localBm(): PathBookmark {
  return { id: "1", path: "/foo", hostId: undefined };
}

function hostBm(hostId = "host-a"): PathBookmark {
  return { id: "2", path: "/bar", hostId };
}

function localTab(): WorkspaceTab {
  return {
    id: 1,
    kind: "workspace",
    title: "term",
    activePaneId: "p",
    layout: { type: "pane", id: "p" },
    sessions: { p: { id: "p", kind: "local", title: "local" } },
  };
}

function sshTab(hostId: string): WorkspaceTab {
  return {
    id: 2,
    kind: "workspace",
    title: "ssh",
    activePaneId: "p",
    layout: { type: "pane", id: "p" },
    sessions: { p: { id: "p", kind: "ssh", title: "ssh", hostId } },
  };
}

function sftpTab(hostId: string): SftpTab {
  return { id: 3, kind: "sftp", title: "sftp", hostId };
}

describe("applicableActions", () => {
  it("never includes new-sftp for a local bookmark", () => {
    const actions = applicableActions(localBm(), sftpTab("host-a"), ALL_ENABLED);
    expect(actions).not.toContain("new-sftp");
  });

  it("includes new-sftp for a host bookmark when enabled", () => {
    const actions = applicableActions(hostBm("host-a"), undefined, ALL_ENABLED);
    expect(actions).toContain("new-sftp");
  });

  it("excludes current-terminal when no terminal tab is active", () => {
    const actions = applicableActions(localBm(), sftpTab("host-a"), ALL_ENABLED);
    expect(actions).not.toContain("current-terminal");
  });

  it("excludes current-terminal on a host mismatch (ssh tab to a different host)", () => {
    const actions = applicableActions(hostBm("host-a"), sshTab("host-b"), ALL_ENABLED);
    expect(actions).not.toContain("current-terminal");
  });

  it("includes current-terminal when the ssh tab's host matches the bookmark's host", () => {
    const actions = applicableActions(hostBm("host-a"), sshTab("host-a"), ALL_ENABLED);
    expect(actions).toContain("current-terminal");
  });

  it("includes current-sftp for a local bookmark against any open sftp tab", () => {
    const actions = applicableActions(localBm(), sftpTab("host-a"), ALL_ENABLED);
    expect(actions).toContain("current-sftp");
  });

  it("excludes current-sftp on a host mismatch", () => {
    const actions = applicableActions(hostBm("host-a"), sftpTab("host-b"), ALL_ENABLED);
    expect(actions).not.toContain("current-sftp");
  });

  it("respects settings toggles regardless of applicability", () => {
    const actions = applicableActions(localBm(), localTab(), ALL_DISABLED);
    expect(actions).toEqual([]);
  });

  it("returns actions in fixed display order", () => {
    const actions = applicableActions(hostBm("host-a"), sftpTab("host-a"), ALL_ENABLED);
    expect(actions).toEqual(["new-terminal", "current-sftp", "new-sftp"]);
  });
});

describe("resolvePrimaryAction", () => {
  it('"current" setting resolves to current-terminal when a terminal is active', () => {
    expect(resolvePrimaryAction(localBm(), localTab(), "current", ALL_ENABLED)).toBe("current-terminal");
  });

  it('"current" setting resolves to current-sftp when an sftp tab is active', () => {
    expect(resolvePrimaryAction(hostBm("host-a"), sftpTab("host-a"), "current", ALL_ENABLED)).toBe(
      "current-sftp",
    );
  });

  it('"new" setting resolves to new-terminal when a terminal is active', () => {
    expect(resolvePrimaryAction(localBm(), localTab(), "new", ALL_ENABLED)).toBe("new-terminal");
  });

  it('"new" setting resolves to new-sftp for a host bookmark when an sftp tab is active', () => {
    expect(resolvePrimaryAction(hostBm("host-a"), sftpTab("host-a"), "new", ALL_ENABLED)).toBe("new-sftp");
  });

  it("falls back to new-terminal on a host mismatch (current-terminal not applicable)", () => {
    expect(resolvePrimaryAction(hostBm("host-a"), sshTab("host-b"), "current", ALL_ENABLED)).toBe(
      "new-terminal",
    );
  });

  it("falls back to new-terminal when there is no active tab at all", () => {
    expect(resolvePrimaryAction(localBm(), undefined, "current", ALL_ENABLED)).toBe("new-terminal");
  });

  it("falls back to new-terminal even when every action is disabled (never fully inert)", () => {
    expect(resolvePrimaryAction(localBm(), localTab(), "current", ALL_DISABLED)).toBe("new-terminal");
  });
});
