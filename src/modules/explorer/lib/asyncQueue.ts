export interface AsyncQueue {
  /** Runs `task` once fewer than `concurrency` tasks are active, queueing it
   *  otherwise. Resolves/rejects with `task`'s own outcome. */
  run<T>(task: () => Promise<T>): Promise<T>;
}

/**
 * Bounded-concurrency task queue. Used by `useFileTree` to cap how many
 * `readDir` calls are in flight at once — rapid expand-clicking across
 * several directories (or, in the future, an "expand all") would otherwise
 * fire one request per directory simultaneously. Local reads don't strictly
 * need this (the OS handles many concurrent syscalls fine), but remote reads
 * all funnel through a single mutex-guarded SFTP channel — queueing keeps
 * the number of blocked-waiting requests bounded instead of firing them all
 * at once and letting them queue up on the backend's lock instead.
 */
export function createAsyncQueue(concurrency: number): AsyncQueue {
  let active = 0;
  const pending: Array<() => void> = [];

  function scheduleNext() {
    if (active >= concurrency) return;
    const run = pending.shift();
    if (!run) return;
    active++;
    run();
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push(() => {
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              scheduleNext();
            });
        });
        scheduleNext();
      });
    },
  };
}
