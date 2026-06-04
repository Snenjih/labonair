import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { usePreferencesStore } from "@/modules/settings/preferences";
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

  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);

  // When tabs location changes away from sidebar, switch panel away from "tabs"
  useEffect(() => {
    if (tabsLocation === "titlebar" && activePanel === "tabs") {
      handlePanelToggle("explorer");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsLocation]);

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const handlePanelToggle = useCallback((panel: SidebarPanel) => {
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
  }, [activePanel]);

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
