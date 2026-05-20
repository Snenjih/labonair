import { Input } from "@/components/ui/input";
import type { ThemeMeta } from "@/lib/useThemeEngine";
import { useThemeStore } from "@/modules/settings/useThemeStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircleIcon, GithubIcon, Upload02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeCard } from "../components/ThemeCard";
import { Button } from "@/components/ui/button";

type TabId = "all" | "installed" | "community";

const DEFAULT_META: ThemeMeta = {
  id: "default",
  name: "Default (System)",
  author: "",
  type: "dark",
  colors: {},
  builtin: true,
};

export function ThemeMarketplace() {
  const {
    installedThemes,
    communityThemes,
    isLoadingCommunity,
    communityError,
    fetchInstalled,
    fetchCommunity,
    cancelPreview,
    previewThemeId,
  } = useThemeStore();

  const savedTheme = usePreferencesStore((s) => s.appTheme);
  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const savedThemeRef = useRef(savedTheme);
  savedThemeRef.current = savedTheme;
  const previewRef = useRef(previewThemeId);
  previewRef.current = previewThemeId;

  useEffect(() => {
    void fetchInstalled();
    void fetchCommunity();
  }, [fetchInstalled, fetchCommunity]);

  // Revert preview when leaving the Themes section
  useEffect(() => {
    return () => {
      if (previewRef.current !== null) {
        cancelPreview();
      }
    };
  }, [cancelPreview]);

  const handleImport = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "JSON Theme", extensions: ["json"] }],
    });
    if (!selected) return;
    try {
      await invoke("theme_import", { sourcePath: selected });
      void fetchInstalled();
    } catch (e) {
      console.error("Theme import failed:", e);
    }
  };

  const q = search.trim().toLowerCase();

  // Build the "installed" list: default + user themes
  const allInstalled: ThemeMeta[] = [DEFAULT_META, ...installedThemes];

  // Build filtered lists per tab
  const filteredInstalled = allInstalled.filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.author.toLowerCase().includes(q),
  );

  // Community: exclude themes whose id already appears in installedThemes
  const installedIds = new Set(installedThemes.map((t) => t.id));
  const communityOnly = communityThemes.filter(
    (r) =>
      !installedIds.has(r.id) &&
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)),
  );

  // "All" tab merges installed + community-only-entries
  const communityInstalled = communityThemes
    .filter((r) => installedIds.has(r.id))
    .map((r) => installedThemes.find((t) => t.id === r.id)!)
    .filter(Boolean);

  const allTabThemes: ThemeMeta[] = [
    DEFAULT_META,
    ...installedThemes.filter((t) => !communityInstalled.some((c) => c.id === t.id)),
    ...communityInstalled,
  ].filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.author.toLowerCase().includes(q),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold">Themes</h1>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Install and manage color themes.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-[11.5px]"
            onClick={() => void openUrl("https://github.com/Snenjih/nexum-themes?tab=contributing-ov-file")}
          >
            <HugeiconsIcon icon={GithubIcon} size={12} strokeWidth={2} />
            Contribute
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-[11.5px]"
            onClick={() => void handleImport()}
          >
            <HugeiconsIcon icon={Upload02Icon} size={12} strokeWidth={2} />
            Import JSON
          </Button>
        </div>
      </div>

      {/* Search */}
      <Input
        type="search"
        placeholder="Search themes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-[12px]"
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/40 pb-0">
        {(["all", "installed", "community"] as TabId[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[12px] font-medium capitalize transition-colors",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {communityError && (tab === "community" || tab === "all") && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">
          <HugeiconsIcon icon={AlertCircleIcon} size={13} strokeWidth={2} />
          {communityError}
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col gap-1">
        {tab === "all" && (
          <>
            {allTabThemes.map((t) => (
              <ThemeCard
                key={t.id}
                kind="installed"
                meta={t}
                isBuiltin={t.id === "default"}
              />
            ))}
            {communityOnly.map((r) => (
              <ThemeCard key={r.id} kind="community" remote={r} />
            ))}
            {isLoadingCommunity && <LoadingRow />}
            {!isLoadingCommunity && allTabThemes.length === 0 && communityOnly.length === 0 && (
              <EmptyState query={q} />
            )}
          </>
        )}

        {tab === "installed" && (
          <>
            {filteredInstalled.map((t) => (
              <ThemeCard
                key={t.id}
                kind="installed"
                meta={t}
                isBuiltin={t.id === "default"}
              />
            ))}
            {filteredInstalled.length === 0 && <EmptyState query={q} />}
          </>
        )}

        {tab === "community" && (
          <>
            {/* Show installed community themes first */}
            {communityThemes
              .filter((r) => installedIds.has(r.id))
              .filter(
                (r) =>
                  !q ||
                  r.name.toLowerCase().includes(q) ||
                  r.author.toLowerCase().includes(q),
              )
              .map((r) => {
                const meta = installedThemes.find((t) => t.id === r.id)!;
                return (
                  <ThemeCard key={r.id} kind="community" remote={r} installedMeta={meta} />
                );
              })}
            {communityOnly.map((r) => (
              <ThemeCard key={r.id} kind="community" remote={r} />
            ))}
            {isLoadingCommunity && <LoadingRow />}
            {!isLoadingCommunity &&
              communityOnly.length === 0 &&
              communityThemes.filter((r) => installedIds.has(r.id)).length === 0 && (
                <EmptyState query={q} offline={!!communityError} />
              )}
          </>
        )}
      </div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground">
      <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
      Loading community themes…
    </div>
  );
}

function EmptyState({ query, offline }: { query: string; offline?: boolean }) {
  if (offline) {
    return (
      <div className="py-8 text-center text-[12px] text-muted-foreground">
        Could not connect to the theme registry.
      </div>
    );
  }
  return (
    <div className="py-8 text-center text-[12px] text-muted-foreground">
      {query ? `No themes matching "${query}"` : "No themes found."}
    </div>
  );
}
