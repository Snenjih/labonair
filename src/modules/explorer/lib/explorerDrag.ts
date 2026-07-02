type Subscriber = () => void;

/** Set only for a drag started on a remote explorer row — `null`/absent
 *  means the dragged paths are local. Drop targets don't currently use this
 *  to block anything (see `explorerDrag`'s module doc); it's carried along
 *  so a future consumer can make host-aware decisions without another
 *  plumbing pass. */
export type DragOrigin = { hostId: string } | null;

type DragState = { paths: string[]; origin: DragOrigin };

let _state: DragState | null = null;
const _subs = new Set<Subscriber>();

function notify() {
  _subs.forEach((s) => s());
}

/** Module-level singleton carrying the paths (and origin host, if remote)
 *  currently being dragged from the sidebar explorer tree to a terminal
 *  pane drop target. Pure JS drag — no OS file handle involved, so it works
 *  for both local and remote rows (see `Capabilities.supportsInternalDrag`). */
export const explorerDrag = {
  start(paths: string[], origin: DragOrigin = null) {
    _state = { paths, origin };
    notify();
  },
  end() {
    _state = null;
    notify();
  },
  get(): DragState | null {
    return _state;
  },
  subscribe(fn: Subscriber): () => void {
    _subs.add(fn);
    return () => _subs.delete(fn);
  },
};
