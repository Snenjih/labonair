import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import ReactDOM from "react-dom/client";
import App from "./app/App";
import { USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";
import { getCurrentWindow } from "@tauri-apps/api/window";

if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// The main window starts hidden (tauri.conf.json: visible: false) so that
// tauri-plugin-window-state can restore geometry before the first paint —
// avoiding a flash of the window at the wrong size/position.
// rAF is throttled when the window is invisible and never fires, so we use
// setTimeout instead. A second call at 500 ms is a safety net.
const showWindow = () =>
  getCurrentWindow()
    .show()
    .catch((e) => console.error("window.show failed:", e));
setTimeout(showWindow, 50);
setTimeout(showWindow, 500);
