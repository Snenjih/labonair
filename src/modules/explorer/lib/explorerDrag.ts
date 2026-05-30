type Subscriber = () => void;

let _paths: string[] | null = null;
const _subs = new Set<Subscriber>();

function notify() {
  _subs.forEach((s) => s());
}

export const explorerDrag = {
  start(paths: string[]) {
    _paths = paths;
    notify();
  },
  end() {
    _paths = null;
    notify();
  },
  get(): string[] | null {
    return _paths;
  },
  subscribe(fn: Subscriber): () => void {
    _subs.add(fn);
    return () => _subs.delete(fn);
  },
};
