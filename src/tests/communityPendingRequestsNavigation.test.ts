import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  PendingRequestsTab: class {}
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppCommunityPendingRequestsTab: mocks.PendingRequestsTab
}));

import openCommunityPendingRequests
from '@components/communities/openCommunityPendingRequests';

describe('openCommunityPendingRequests', () => {
  let closeTabsUntilTab: ReturnType<typeof vi.fn>;
  let createTab: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeTabsUntilTab = vi.fn().mockResolvedValue(true);
    open = vi.fn().mockResolvedValue(undefined);
    createTab = vi.fn(() => ({open}));
  });

  it('slices the stack to an existing tab for the same community', async() => {
    const existingTab = new mocks.PendingRequestsTab() as any;
    existingTab.payload = {communityId: 10 as ChatId};
    const slider = {
      closeTabsUntilTab,
      createTab,
      getHistory: () => [existingTab]
    } as any;

    await openCommunityPendingRequests({
      slider,
      communityId: 10 as ChatId
    });

    expect(closeTabsUntilTab).toHaveBeenCalledWith(existingTab);
    expect(createTab).not.toHaveBeenCalled();
  });

  it('opens a tab when only another community has one in the stack', async() => {
    const otherTab = new mocks.PendingRequestsTab() as any;
    otherTab.payload = {communityId: 11 as ChatId};
    const slider = {
      closeTabsUntilTab,
      createTab,
      getHistory: () => [otherTab]
    } as any;

    await openCommunityPendingRequests({
      slider,
      communityId: 10 as ChatId
    });

    expect(closeTabsUntilTab).not.toHaveBeenCalled();
    expect(createTab).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith({communityId: 10 as ChatId});
  });
});
