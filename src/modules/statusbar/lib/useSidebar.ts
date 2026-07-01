import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setSidebarActivePanel, setSidebarOpen } from "@/modules/settings/store";
import type { SidebarPanel } from "../StatusBar";

export interface SidebarReturn {
  sidebarRef: React.RefObject<PanelImperativeHandle | null>;
  activePanel: SidebarPanel;
  setActivePanel: React.Dispatch<React.SetStateAction<SidebarPanel>>;
  toggleSidebar: () => void;
  handlePanelToggle: (panel: SidebarPanel) => void;
  onSidebarResize: (size: { asPercentage: number }) => void;
}

export function useSidebar(): SidebarReturn {
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const [activePanel, setActivePanel] = useState<SidebarPanel>("explorer");
  const lastActivePanelRef = useRef<SidebarPanel>("explorer");

  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const storedOpen = usePreferencesStore((s) => s.sidebarOpen);
  const storedPanel = usePreferencesStore((s) => s.sidebarActivePanel);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);

  // One-time restore: apply persisted sidebar state once preferences are loaded.
  // restoredRef guards the persist effect below from firing during this init phase.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!prefsHydrated || restoredRef.current) return;
    restoredRef.current = true;

    // Guard: "tabs" panel is only valid when tabsLocation === "sidebar"
    const resolvedPanel: SidebarPanel = !storedOpen
      ? null
      : storedPanel === "tabs" && tabsLocation !== "sidebar"
        ? "explorer"
        : storedPanel;

    setActivePanel(resolvedPanel);
    lastActivePanelRef.current = resolvedPanel ?? "explorer";

    const p = sidebarRef.current;
    if (p && !storedOpen) p.collapse();
    // storedOpen === true: defaultSize="225px" already renders the panel open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsHydrated]);

  // When tabs location changes away from sidebar, switch panel away from "tabs"
  useEffect(() => {
    if (tabsLocation === "titlebar" && activePanel === "tabs") {
      handlePanelToggle("explorer");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsLocation]);

  // Persist whenever activePanel changes. Covers all code paths:
  // handlePanelToggle, toggleSidebar, onSidebarResize, and direct setActivePanel
  // calls (e.g. openSnippetsPanel from the command palette).
  useEffect(() => {
    if (!restoredRef.current) return;
    void setSidebarOpen(activePanel !== null);
    if (activePanel && activePanel !== "hosts") {
      void setSidebarActivePanel(activePanel as "explorer" | "snippets" | "tabs");
    }
  }, [activePanel]);

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const handlePanelToggle = useCallback(
    (panel: SidebarPanel) => {
      const p = sidebarRef.current;
      if (!p) return;
      if (activePanel === panel) {
        if (p.getSize().asPercentage <= 0) {
          p.expand();
        } else {
          p.collapse();
          setActivePanel(null);
        }
      } else {
        if (panel) lastActivePanelRef.current = panel;
        setActivePanel(panel);
        if (p.getSize().asPercentage <= 0) p.expand();
      }
    },
    [activePanel],
  );

  const onSidebarResize = useCallback((size: { asPercentage: number }) => {
    if (size.asPercentage <= 0) {
      setActivePanel(null);
    } else if (size.asPercentage > 0) {
      setActivePanel((prev) => {
        const next = prev ?? lastActivePanelRef.current ?? "explorer";
        lastActivePanelRef.current = next;
        return next;
      });
    }
  }, []);

  return {
    sidebarRef,
    activePanel,
    setActivePanel,
    toggleSidebar,
    handlePanelToggle,
    onSidebarResize,
  };
}
