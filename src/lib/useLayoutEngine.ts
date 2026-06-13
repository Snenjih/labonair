import { useEffect } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";

export function useLayoutEngine(): void {
  const radius = usePreferencesStore((s) => s.appCornerRadius);
  const density = usePreferencesStore((s) => s.appDensity);

  useEffect(() => {
    document.documentElement.style.setProperty("--radius", `${radius}px`);
  }, [radius]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("density-compact", "density-default", "density-relaxed");
    root.classList.add(`density-${density}`);
  }, [density]);
}
