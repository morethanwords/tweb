type TextSession = {finish: () => void | Promise<void>; cancel: () => void};

/** One editor, no store/global state. The empty path is deliberately synchronous. */
export default function createTextSessionBarrier() {
  const sessions = new Set<TextSession>();
  let pending: Promise<void>;
  let generation = 0;
  const check = (version: number) => {
    if(version !== generation) throw new DOMException('Text session cancelled', 'AbortError');
  };
  function finish(): void | Promise<void> {
    if(pending) return pending;
    const version = generation;
    const work = Array.from(sessions, session => session.finish()).filter(Boolean) as Promise<void>[];
    if(!work.length) return;
    const task = (async() => {
      let remaining = work;
      while(remaining.length) {
        await Promise.all(remaining);
        check(version);
        // Focus changes during recovery may register another session.
        remaining = Array.from(sessions, session => session.finish()).filter(Boolean) as Promise<void>[];
      }
    })();
    pending = task.finally(() => { if(pending === result) pending = undefined; });
    const result = pending;
    return result;
  }
  return {
    register(session: TextSession) {
      sessions.add(session);
      return () => { sessions.delete(session); };
    },
    finish,
    cancel() {
      ++generation;
      pending = undefined;
      const current = Array.from(sessions);
      sessions.clear();
      current.forEach(session => session.cancel());
    },
    /** Callers retain their own busy guard; this adds none on the sync path. */
    afterFinish(callback: () => void): void | Promise<void> {
      const version = generation;
      const work = finish();
      if(work) return work.then(() => { check(version); callback(); });
      callback();
    }
  };
}
