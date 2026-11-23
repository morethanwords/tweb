import noop from '@helpers/noop';
import createUpdatesManager, {push} from '@/tests/helpers/updatesManager';
import {Update} from '@layer';

// An update that comes ahead of the state waits in the pending list for the ones before it. A local one (the pts of
// a chat the user has just read, of messages just deleted) is taken while a difference is running too, and waits
// there; the difference then moves the state past it. Applied later as if it still filled a gap, it took the state
// back to its own pts — the next update looked like a gap and the whole stretch was asked for again — and, counted
// as a step the state still had to make, could take a real gap for filled.

function setup() {
  const {manager, saved} = createUpdatesManager();
  const getDifference = manager.getDifference = vi.fn();
  return {manager, saved, getDifference};
}

/** the state at 10 takes a local update of pts 12 while its difference runs, which ends at 20 */
function setupPassedByDifference() {
  const setupResult = setup();
  const {manager} = setupResult;
  manager.updatesState.pts = 10;
  manager.updatesState.syncLoading = new Promise(noop);

  manager.processLocalUpdate({_: 'updatePts', pts: 12, pts_count: 1});

  manager.updatesState.syncLoading = null;
  manager.updatesState.pts = 20;
  return setupResult;
}

function readMessages(pts: number, ptsCount = 1): Update.updateReadMessagesContents {
  return {_: 'updateReadMessagesContents', messages: [pts], pts, pts_count: ptsCount, date: 2};
}

function savedPts(saved: Update[]) {
  return saved.map((update) => (update as Update.updateReadMessagesContents).pts);
}

describe('a local update taken while the difference runs, which the difference then passes', () => {
  test('does not take the state back', () => {
    const {manager} = setupPassedByDifference();

    push(manager, readMessages(21));

    expect(manager.updatesState.pts).toBe(21);
    expect(manager.updatesState.pendingPtsUpdates).toEqual([]);
  });

  test('does not fill a gap that is still there', () => {
    const {manager, saved} = setupPassedByDifference();

    // * 23 waits for 21 and 22, and 21 comes
    push(manager, readMessages(23));
    push(manager, readMessages(21));

    expect(manager.updatesState.pts).toBe(21);
    expect(savedPts(saved)).toEqual([21]);
    expect(manager.updatesState.pendingPtsUpdates.map((update: Update.updateReadMessagesContents) => update.pts)).toEqual([23]);
  });
});

describe('the pending list, as before', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('applies an update of no count once the state reaches its pts', () => {
    const {manager, saved} = setup();
    manager.updatesState.pts = 10;

    push(manager, readMessages(12, 0));
    push(manager, readMessages(11));
    push(manager, readMessages(12));

    expect(manager.updatesState.pts).toBe(12);
    expect(saved.map((update) => [(update as Update.updateReadMessagesContents).pts, (update as Update.updateReadMessagesContents).pts_count])).toEqual([[11, 1], [12, 1], [12, 0]]);
  });

  test('applies an update of no count that a counted one has passed, and keeps the state where it is', () => {
    const {manager, saved} = setup();
    manager.updatesState.pts = 10;

    // * a read marker at 12 waits for 11 and 12; one counted update of three steps takes the state to 13 past it: the
    // * marker still has its effect, as one coming now with no count would (tdesktop's PtsWaiter skips counted ones only)
    push(manager, readMessages(12, 0));
    push(manager, readMessages(13, 3));

    expect(manager.updatesState.pts).toBe(13);
    expect(saved.map((update) => [(update as Update.updateReadMessagesContents).pts, (update as Update.updateReadMessagesContents).pts_count])).toEqual([[13, 3], [12, 0]]);
    expect(manager.updatesState.pendingPtsUpdates).toEqual([]);
  });

  test('asks for no difference once the gap it waited for is passed', () => {
    const {manager, getDifference} = setup();
    manager.updatesState.pts = 10;

    push(manager, readMessages(12));
    manager.processLocalUpdate({_: 'updatePts', pts: 12, pts_count: 2});
    vi.advanceTimersByTime(1000);

    expect(manager.updatesState.pts).toBe(12);
    expect(manager.updatesState.pendingPtsUpdates).toEqual([]);
    expect(getDifference).not.toHaveBeenCalled();
  });
});
