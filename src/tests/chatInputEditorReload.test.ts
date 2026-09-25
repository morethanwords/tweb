import {createChatInputEditorReloadScheduler} from '@components/chat/inputEditor/reload';

describe('composition-safe editor reload', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function mountScheduler() {
    const input = document.createElement('div');
    let composing = false;
    const scheduler = createChatInputEditorReloadScheduler(input, () => composing);
    const start = () => composing = true;
    const end = () => {
      composing = false;
      input.dispatchEvent(new CompositionEvent('compositionend'));
    };
    return {end, scheduler, start};
  }

  test('runs immediately outside composition and coalesces pending reloads', () => {
    const {end, scheduler, start} = mountScheduler();
    const first = vi.fn();
    const stale = vi.fn();
    const latest = vi.fn();
    scheduler.run(first);
    expect(first).toHaveBeenCalledOnce();
    start();
    scheduler.run(stale);
    end();
    scheduler.run(latest);
    expect(latest).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    scheduler.destroy();
  });

  test('defers a reload requested only after compositionend', () => {
    const {end, scheduler, start} = mountScheduler();
    const reload = vi.fn();
    start();
    end();
    scheduler.run(reload);
    expect(reload).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledOnce();
    scheduler.destroy();
  });

  test('waits for a new composition that starts during the settling delay', () => {
    const {end, scheduler, start} = mountScheduler();
    const reload = vi.fn();
    start();
    scheduler.run(reload);
    end();
    start();
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
    end();
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledOnce();
    scheduler.destroy();
  });

  test('drops pending reloads and future events after disposal', () => {
    const {end, scheduler, start} = mountScheduler();
    const reload = vi.fn();
    start();
    scheduler.run(reload);
    end();
    scheduler.destroy();
    vi.runAllTimers();
    end();
    scheduler.run(reload);
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
  });
});
