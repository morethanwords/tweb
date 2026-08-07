import {describe, expect, it, vi} from 'vitest';
import SidebarSlider from '@components/slider';

type TestTab = {
  id: string,
  isConfirmationNeededOnClose?: () => Promise<void>
};

function createSlider(historyTabIds: TestTab[]) {
  const onCloseTab = vi.fn();
  const closeTab = vi.fn((
    id: TestTab,
    animate?: boolean,
    isNavigation?: boolean
  ) => {
    if(historyTabIds[historyTabIds.length - 1] !== id) {
      return false;
    }

    historyTabIds.pop();
    onCloseTab(id, animate, isNavigation);
    return true;
  });
  const slider = Object.assign(Object.create(SidebarSlider.prototype), {
    _selectTab: vi.fn(),
    canHideFirst: true,
    closeTab,
    historyTabIds,
    onCloseTab,
    tabs: new Map(historyTabIds.map((tab) => [tab, tab]))
  }) as SidebarSlider;

  return {onCloseTab, slider};
}

describe('SidebarSlider closeTabsUntilTab', () => {
  it('closes only the tabs above the target', async() => {
    const target = {id: 'community'};
    const edit = {id: 'edit'};
    const members = {id: 'members'};
    const history = [target, edit, members];
    const {onCloseTab, slider} = createSlider(history);

    await expect(slider.closeTabsUntilTab(target as any)).resolves.toBe(true);

    expect(history).toEqual([target]);
    expect(onCloseTab.mock.calls.map(([tab]) => tab)).toEqual([members, edit]);
  });

  it('stops at a rejected confirmation and keeps that tab open', async() => {
    const target = {id: 'community'};
    const guarded = {
      id: 'edit',
      isConfirmationNeededOnClose: vi.fn(
        () => Promise.reject(new Error('cancelled'))
      )
    };
    const members = {id: 'members'};
    const history = [target, guarded, members];
    const {onCloseTab, slider} = createSlider(history);

    await expect(slider.closeTabsUntilTab(target as any)).resolves.toBe(false);

    expect(history).toEqual([target, guarded]);
    expect(onCloseTab).toHaveBeenCalledOnce();
    expect(onCloseTab).toHaveBeenCalledWith(members, undefined, false);
    expect(guarded.isConfirmationNeededOnClose).toHaveBeenCalledOnce();
  });

  it('does not alter history when the target is absent', async() => {
    const tab = {id: 'edit'};
    const history = [tab];
    const {onCloseTab, slider} = createSlider(history);

    await expect(slider.closeTabsUntilTab({id: 'missing'} as any))
    .resolves.toBe(false);

    expect(history).toEqual([tab]);
    expect(onCloseTab).not.toHaveBeenCalled();
  });
});
