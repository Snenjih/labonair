import {
  Delete02Icon,
  Download02Icon,
  SourceCodeIcon,
  Tick02Icon,
  User03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { resolveVariant, type ThemeMeta, variantsForMode } from "@/lib/useThemeEngine";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { RemoteTheme } from "@/modules/settings/useThemeStore";
import { useThemeStore } from "@/modules/settings/useThemeStore";
import { ThemeThumbnail } from "./ThemeThumbnail";

type InstalledCardProps = {
  meta: ThemeMeta;
  isBuiltin?: boolean;
};

type CommunityCardProps = {
  remote: RemoteTheme;
  installedMeta?: ThemeMeta;
};

export type ThemeCardProps =
  | ({ kind: "installed" } & InstalledCardProps)
  | ({ kind: "community" } & CommunityCardProps);

export function ThemeCard(props: ThemeCardProps) {
  if (props.kind === "installed") {
    return <InstalledCard meta={props.meta} isBuiltin={props.isBuiltin} />;
  }
  return <CommunityCard remote={props.remote} installedMeta={props.installedMeta} />;
}

function InstalledCard({ meta, isBuiltin }: { meta: ThemeMeta; isBuiltin?: boolean }) {
  const savedTheme = usePreferencesStore((s) => s.appTheme);
  const resolvedMode = usePreferencesStore((s) => s.resolvedMode);
  const variantOverrides = usePreferencesStore((s) => s.themeVariantOverrides);
  const { previewThemeId, previewTheme, cancelPreview, applyTheme, uninstallTheme } = useThemeStore();

  const isActive = savedTheme === meta.id;
  const isPreviewing = previewThemeId === meta.id;

  const darkVariant = resolveVariant(meta, "dark", variantOverrides[meta.id]?.dark);
  const lightVariant = resolveVariant(meta, "light", variantOverrides[meta.id]?.light);
  const modeOptions = variantsForMode(meta, resolvedMode);

  const handlePreview = () => {
    if (isPreviewing) {
      cancelPreview();
    } else {
      previewTheme(meta, variantOverrides[meta.id]?.[resolvedMode]);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex items-start justify-between rounded-lg border border-transparent px-4 py-3 transition-colors",
        isActive ? "border-primary/30 bg-primary/5" : "hover:bg-accent/50",
        isPreviewing && "border-accent/50 bg-accent/10",
      )}
    >
      {/* Active ribbon */}
      {isActive && (
        <div className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
      )}

      {/* Left: thumbnails + metadata */}
      <div className="flex min-w-0 items-center gap-3 pr-4">
        <div className="flex shrink-0 items-center gap-1">
          {darkVariant && <ThemeThumbnail colors={darkVariant[1].colors} />}
          {lightVariant && <ThemeThumbnail colors={lightVariant[1].colors} />}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">{meta.name}</span>
            {isActive && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Active
              </span>
            )}
            {isPreviewing && !isActive && (
              <span className="rounded-full bg-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                Previewing
              </span>
            )}
          </div>
          {meta.author && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <HugeiconsIcon icon={User03Icon} size={11} strokeWidth={1.5} />
              <span>{meta.author}</span>
            </div>
          )}
          {modeOptions.length > 1 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {modeOptions.map(([key, variant]) => {
                const activeKey = variantOverrides[meta.id]?.[resolvedMode] ?? modeOptions[0][0];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void applyTheme(meta.id, key)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                      activeKey === key
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {variant.label ?? key}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant={isPreviewing ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 text-[11.5px]"
          onClick={handlePreview}
        >
          {isPreviewing ? "Cancel" : "Preview"}
        </Button>
        {isActive ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 cursor-default px-2.5 text-[11.5px] opacity-60"
            disabled
          >
            <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="mr-1" />
            Applied
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11.5px]"
            onClick={() => void applyTheme(meta.id)}
          >
            Apply
          </Button>
        )}
        {!isBuiltin && (
          <button
            type="button"
            title="Uninstall theme"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            onClick={() => void uninstallTheme(meta.id)}
          >
            <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

function CommunityCard({ remote, installedMeta }: { remote: RemoteTheme; installedMeta?: ThemeMeta }) {
  const { installingIds, installTheme, uninstallTheme, applyTheme } = useThemeStore();
  const savedTheme = usePreferencesStore((s) => s.appTheme);

  const isInstalling = installingIds.has(remote.id);
  const isActive = !!installedMeta && savedTheme === installedMeta.id;
  const previewVariant =
    installedMeta && (resolveVariant(installedMeta, "dark") ?? resolveVariant(installedMeta, "light"));

  const handleApply = async () => {
    if (!installedMeta) return;
    await applyTheme(installedMeta.id);
  };

  const handleUninstall = async () => {
    if (!installedMeta) return;
    await uninstallTheme(installedMeta.id);
  };

  return (
    <div
      className={cn(
        "group flex items-start justify-between rounded-lg px-4 py-3 transition-colors",
        installedMeta
          ? isActive
            ? "border border-primary/30 bg-primary/5"
            : "border border-transparent hover:bg-accent/50"
          : "border border-transparent hover:bg-accent/60",
      )}
    >
      {/* Active ribbon for installed+active */}
      {installedMeta && isActive && (
        <div className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
      )}

      {/* Left: thumbnail (installed only) + metadata */}
      <div className="flex min-w-0 items-start gap-3 pr-4">
        {previewVariant && (
          <div className="mt-0.5 shrink-0">
            <ThemeThumbnail colors={previewVariant[1].colors} />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">{remote.name}</span>
            {installedMeta ? (
              <>
                <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                  Installed
                </span>
                {isActive && (
                  <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    Active
                  </span>
                )}
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground">v{remote.version}</span>
            )}
          </div>
          {remote.description && (
            <span className="text-[11.5px] text-muted-foreground">{remote.description}</span>
          )}
          {remote.author && (
            <a
              href={remote.authorUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={User03Icon} size={11} strokeWidth={1.5} />
              <span>{remote.author}</span>
            </a>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {installedMeta ? (
          <>
            {isActive ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 cursor-default px-2.5 text-[11.5px] opacity-60"
                disabled
              >
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} className="mr-1" />
                Applied
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11.5px]"
                onClick={() => void handleApply()}
              >
                Apply
              </Button>
            )}
            <button
              type="button"
              title="Uninstall theme"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              onClick={() => void handleUninstall()}
            >
              <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={2} />
            </button>
          </>
        ) : (
          <>
            {remote.rawUrl && (
              <a
                href={remote.rawUrl}
                target="_blank"
                rel="noreferrer"
                title="View theme source JSON"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent/60 hover:text-foreground group-hover:opacity-100"
              >
                <HugeiconsIcon icon={SourceCodeIcon} size={13} strokeWidth={2} />
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-[11.5px]"
              disabled={isInstalling}
              onClick={() => void installTheme(remote)}
            >
              {isInstalling ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                <HugeiconsIcon icon={Download02Icon} size={12} strokeWidth={2} />
              )}
              {isInstalling ? "Installing…" : "Install"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
