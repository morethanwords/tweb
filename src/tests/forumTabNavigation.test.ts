import {describe, expect, it} from 'vitest';

vi.mock('@components/forumTab/forumTab', () => ({
  ForumTab: class ForumTab {}
}));

import '@helpers/peerIdPolyfill';
import findForumTabByPeerId
from '@components/forumTab/findForumTabByPeerId';
import {ForumTab} from '@components/forumTab/forumTab';

function makeForumTab(peerId: PeerId) {
  const tab = Object.create(ForumTab.prototype) as ForumTab;
  tab.peerId = peerId;
  return tab;
}

describe('Forum tab navigation', () => {
  it('finds a same-peer ForumTab even when another tab is above it', () => {
    const peerId = 100 as PeerId;
    const existing = makeForumTab(peerId);
    const other = makeForumTab(200 as PeerId);
    const editTab = {peerId};

    expect(findForumTabByPeerId(
      [other, existing, editTab],
      peerId
    )).toBe(existing);
  });

  it('does not mistake another peer-aware tab for a ForumTab', () => {
    const peerId = 100 as PeerId;

    expect(findForumTabByPeerId([{peerId}], peerId)).toBeUndefined();
  });
});
