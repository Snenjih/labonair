import { ArrowDown01Icon, Folder01Icon, Home03Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AiAttachFileDetail } from "@/modules/ai/lib/composer";
import type { FsProvider } from "@/modules/explorer/lib/fsProvider";
import { createLocalFsProvider } from "@/modules/explorer/lib/providers/localFsProvider";
import { createRemoteFsProvider } from "@/modules/explorer/lib/providers/remoteFsProvider";
import type { Segment } from "./lib/pathUtils";
import { relativePath, segmentsFromCwd } from "./lib/pathUtils";

/** Identifies the SSH session backing the active pane, when it's remote —
 *  same {hostId, sessionId} shape `ExplorerTarget` uses, so the breadcrumb
 *  reads/browses through the identical session the sidebar tree already has
 *  open instead of standing up a second one. */
export type BreadcrumbRemoteTarget = { hostId: string; sessionId: string };

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  remoteTarget?: BreadcrumbRemoteTarget | null;
  onCd: (path: string) => void;
  onCdInNewTab?: (path: string) => void;
};

const localProvider = createLocalFsProvider();

/** Exported for testability — picks the same provider abstraction the
 *  explorer sidebar tree uses, keyed off the target resolved for the active
 *  tab's session, so local/remote directory listing goes through one shared
 *  code path instead of the breadcrumb reimplementing its own. */
export function resolveProvider(remoteTarget: BreadcrumbRemoteTarget | null | undefined): FsProvider {
  return remoteTarget ? createRemoteFsProvider(remoteTarget.sessionId, remoteTarget.hostId) : localProvider;
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  if (i <= 0) return "/";
  return path.slice(0, i);
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function CwdBreadcrumb({ cwd, filePath, home, remoteTarget, onCd, onCdInNewTab }: Props) {
  // File mode: dir segments navigate; filename is the terminal leaf.
  if (filePath) {
    const dir = dirname(filePath);
    const name = basename(filePath);
    const segments = segmentsFromCwd(dir, home);
    const first = segments[0];
    const middle = segments.slice(1);
    return (
      <Breadcrumb>
        <BreadcrumbList className="gap-1 text-xs sm:gap-1.5">
          {first ? (
            <SegmentWithContextMenu
              seg={first}
              cwd={cwd}
              remoteTarget={remoteTarget}
              onCd={onCd}
              onCdInNewTab={onCdInNewTab}
            />
          ) : null}
          {middle.length > 0 ? (
            <CollapsedSegments
              segments={middle}
              cwd={cwd}
              remoteTarget={remoteTarget}
              onCd={onCd}
              onCdInNewTab={onCdInNewTab}
            />
          ) : null}
          {middle.map((s) => (
            <span key={s.fullPath} className="contents max-md:hidden">
              <SegmentWithContextMenu
                seg={s}
                cwd={cwd}
                remoteTarget={remoteTarget}
                onCd={onCd}
                onCdInNewTab={onCdInNewTab}
              />
            </span>
          ))}
          <BreadcrumbItem>
            <BreadcrumbPage className="text-foreground">{name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (!cwd) {
    return <span className="text-xs text-muted-foreground/70">no directory</span>;
  }

  const segments = segmentsFromCwd(cwd, home);
  const current = segments[segments.length - 1];
  const parents = segments.slice(0, -1);

  const firstParent = parents[0];
  const middleParents = parents.slice(1);
  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1 text-xs sm:gap-1.5">
        {firstParent ? (
          <SegmentWithContextMenu
            seg={firstParent}
            cwd={cwd}
            remoteTarget={remoteTarget}
            onCd={onCd}
            onCdInNewTab={onCdInNewTab}
          />
        ) : null}
        {middleParents.length > 0 ? (
          <CollapsedSegments
            segments={middleParents}
            cwd={cwd}
            remoteTarget={remoteTarget}
            onCd={onCd}
            onCdInNewTab={onCdInNewTab}
          />
        ) : null}
        {middleParents.map((s) => (
          <span key={s.fullPath} className="contents max-md:hidden">
            <SegmentWithContextMenu
              seg={s}
              cwd={cwd}
              remoteTarget={remoteTarget}
              onCd={onCd}
              onCdInNewTab={onCdInNewTab}
            />
          </span>
        ))}
        <BreadcrumbItem>
          <CurrentSegmentWithContextMenu
            seg={current}
            cwd={cwd}
            remoteTarget={remoteTarget}
            onCd={onCd}
            onCdInNewTab={onCdInNewTab}
          />
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

type SegmentMenuProps = {
  seg: Segment;
  cwd: string | null;
  remoteTarget?: BreadcrumbRemoteTarget | null;
  onCd: (path: string) => void;
  onCdInNewTab?: (path: string) => void;
};

function SegmentContextMenuContent({ seg, cwd, remoteTarget, onCd, onCdInNewTab }: SegmentMenuProps) {
  const displayName = seg.isHome ? "Home" : seg.label;
  const rel = cwd ? relativePath(cwd, seg.fullPath) : seg.fullPath;
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuLabel className="text-[11px]">{displayName}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem
        className="text-[12px]"
        onSelect={() => void navigator.clipboard.writeText(seg.fullPath)}
      >
        Copy absolute path
      </ContextMenuItem>
      <ContextMenuItem className="text-[12px]" onSelect={() => void navigator.clipboard.writeText(rel)}>
        Copy relative path
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className="text-[12px]" onSelect={() => onCd(seg.fullPath)}>
        Open in current terminal
      </ContextMenuItem>
      {onCdInNewTab && (
        <ContextMenuItem className="text-[12px]" onSelect={() => onCdInNewTab(seg.fullPath)}>
          Open in new terminal
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        className="text-[12px]"
        onSelect={() => {
          const detail: AiAttachFileDetail = {
            path: seg.fullPath,
            sessionId: remoteTarget?.sessionId,
            hostId: remoteTarget?.hostId,
          };
          window.dispatchEvent(new CustomEvent<AiAttachFileDetail>("labonair:ai-attach-file", { detail }));
        }}
      >
        Reference in AI chat
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function SegmentWithContextMenu({ seg, cwd, remoteTarget, onCd, onCdInNewTab }: SegmentMenuProps) {
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={() => onCd(seg.fullPath)} className="cursor-pointer">
                <Badge
                  variant="outline"
                  className="gap-1 rounded-full text-muted-foreground hover:text-foreground"
                >
                  {seg.isHome ? (
                    <HugeiconsIcon icon={Home03Icon} className="size-3" strokeWidth={1.75} />
                  ) : null}
                  {seg.isHome ? "Home" : seg.label}
                </Badge>
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
        </ContextMenuTrigger>
        <SegmentContextMenuContent
          seg={seg}
          cwd={cwd}
          remoteTarget={remoteTarget}
          onCd={onCd}
          onCdInNewTab={onCdInNewTab}
        />
      </ContextMenu>
      <BreadcrumbSeparator className="[&>svg]:size-3" />
    </>
  );
}

function CurrentSegmentWithContextMenu({ seg, cwd, remoteTarget, onCd, onCdInNewTab }: SegmentMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span>
          <CurrentSegmentDropdown
            label={seg.label}
            path={seg.fullPath}
            remoteTarget={remoteTarget}
            onCd={onCd}
          />
        </span>
      </ContextMenuTrigger>
      <SegmentContextMenuContent
        seg={seg}
        cwd={cwd}
        remoteTarget={remoteTarget}
        onCd={onCd}
        onCdInNewTab={onCdInNewTab}
      />
    </ContextMenu>
  );
}

function CurrentSegmentDropdown({
  label,
  path,
  remoteTarget,
  onCd,
}: {
  label: string;
  path: string;
  remoteTarget?: BreadcrumbRemoteTarget | null;
  onCd: (p: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const provider = resolveProvider(remoteTarget);
      const page = await provider.readDir(path);
      const dirs = page.entries.filter((e) => e.kind === "dir").map((e) => e.name);
      setChildren(dirs);
    } catch (e) {
      setError(String(e));
      setChildren([]);
    }
  }, [path, remoteTarget]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <BreadcrumbPage className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-foreground hover:bg-accent">
          {label === "~" ? (
            <>
              <HugeiconsIcon icon={Home03Icon} className="size-3" strokeWidth={1.75} />
              Home
            </>
          ) : (
            label
          )}
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 opacity-70" strokeWidth={2} />
        </BreadcrumbPage>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {children === null ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
        ) : children.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{error ?? "No subfolders"}</div>
        ) : (
          children.map((name) => (
            <DropdownMenuItem key={name} onSelect={() => onCd(path === "/" ? `/${name}` : `${path}/${name}`)}>
              <HugeiconsIcon
                icon={Folder01Icon}
                className="size-3.5 text-muted-foreground"
                strokeWidth={1.75}
              />
              {name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CollapsedSegments({
  segments,
  cwd,
  remoteTarget,
  onCd,
  onCdInNewTab,
}: {
  segments: Segment[];
  cwd: string | null;
  remoteTarget?: BreadcrumbRemoteTarget | null;
  onCd: (p: string) => void;
  onCdInNewTab?: (p: string) => void;
}) {
  return (
    <span className="contents md:hidden">
      <BreadcrumbItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Show hidden folders"
              className="flex items-center rounded-md px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {segments.map((s) => (
              <ContextMenu key={s.fullPath}>
                <ContextMenuTrigger asChild>
                  <DropdownMenuItem onSelect={() => onCd(s.fullPath)}>
                    <HugeiconsIcon
                      icon={s.isHome ? Home03Icon : Folder01Icon}
                      className="size-3.5 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <span className="truncate">{s.isHome ? "Home" : s.label}</span>
                  </DropdownMenuItem>
                </ContextMenuTrigger>
                <SegmentContextMenuContent
                  seg={s}
                  cwd={cwd}
                  remoteTarget={remoteTarget}
                  onCd={onCd}
                  onCdInNewTab={onCdInNewTab}
                />
              </ContextMenu>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </BreadcrumbItem>
      <BreadcrumbSeparator className="[&>svg]:size-3" />
    </span>
  );
}
