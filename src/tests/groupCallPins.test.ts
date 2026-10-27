/*
 * Pins follow what a participant's roster row says they send.
 *
 * A stopped screencast used to stay pinned in a conference: pins were retired only when the media
 * bookkeeping dropped a source, and a conference keeps every SSRC it has mapped (the receive
 * transforms need the old ones). The panel then kept a black stage over a tile that was gone.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

vi.mock('@components/groupCall/allowedToSpeakCue', () => ({default: vi.fn()}));

import GroupCallInstance from '@lib/calls/groupCallInstance';

const video = (source: number) => ({
  _: 'groupCallParticipantVideo',
  pFlags: {},
  endpoint: 'endpoint-' + source,
  source_groups: [{_: 'groupCallParticipantVideoSourceGroup', semantics: 'SIM', sources: [source, source + 1]}]
});

function row(userId: number, media: {video?: number, presentation?: number, left?: boolean, self?: boolean} = {}) {
  return {
    _: 'groupCallParticipant',
    peer: {_: 'peerUser', user_id: '' + userId},
    pFlags: {
      can_self_unmute: true,
      ...(media.left ? {left: true} : {}),
      ...(media.self ? {self: true} : {})
    },
    source: userId,
    date: 1,
    ...(media.video ? {video: video(media.video)} : {}),
    ...(media.presentation ? {presentation: video(media.presentation)} : {})
  } as any;
}

describe('GroupCallInstance pins', () => {
  const instances: GroupCallInstance[] = [];
  const makeInstance = () => {
    const instance = new GroupCallInstance({id: 'pins' as any, chatId: 0 as any, managers: {} as any});
    instances.push(instance);
    return instance;
  };

  afterEach(() => {
    instances.splice(0).forEach((instance) => (instance as any).pinnedSources.length = 0);
  });

  it('pins a screencast once and unpins it when the row stops carrying it', () => {
    const instance = makeInstance();
    instance.syncParticipantPins(row(7, {video: 100, presentation: 200}));
    expect(instance.pinnedSource).toBe(200);

    // the same screencast in a later row does not pin it over a choice made since
    instance.pinSource(100);
    instance.syncParticipantPins(row(7, {video: 100, presentation: 200}));
    expect(instance.pinnedSource).toBe(100);

    instance.unpinAll();
    instance.pinSource(200);
    instance.syncParticipantPins(row(7, {video: 100}));
    expect(instance.pinnedSource).toBeUndefined();
  });

  it('unpins a camera that stops, and everything of a participant who leaves', () => {
    const instance = makeInstance();
    instance.syncParticipantPins(row(7, {video: 100}));
    instance.pinSource(100);
    instance.syncParticipantPins(row(7));
    expect(instance.pinnedSource).toBeUndefined();

    instance.syncParticipantPins(row(8, {video: 300, presentation: 400}));
    expect(instance.pinnedSource).toBe(400);
    instance.syncParticipantPins(row(8, {video: 300, presentation: 400, left: true}));
    expect(instance.pinnedSource).toBeUndefined();
  });

  // A conference re-reads its roster, and a page read before the screencast started can land after.
  it('does not pin a screencast again over the user\'s unpin when a stale row comes in between', () => {
    const instance = makeInstance();
    instance.syncParticipantPins(row(7, {presentation: 200}));
    instance.unpinAll();
    instance.syncParticipantPins(row(7));
    instance.syncParticipantPins(row(7, {presentation: 200}));
    expect(instance.pinnedSource).toBeUndefined();

    // a new screencast of theirs has a new source, and is pinned
    instance.syncParticipantPins(row(7, {presentation: 210}));
    expect(instance.pinnedSource).toBe(210);
  });

  it('pins our next screencast again: it always goes by the same name', () => {
    const instance = makeInstance();
    instance.syncParticipantPins(row(1, {presentation: 500, self: true}));
    instance.syncParticipantPins(row(1, {self: true}));
    instance.syncParticipantPins(row(1, {presentation: 501, self: true}));
    expect(instance.pinnedSource).toBe('presentation');
  });

  it('pins our own screencast by its connection, the way its tile is looked up', () => {
    const instance = makeInstance();
    instance.syncParticipantPins(row(1, {presentation: 500, self: true}));
    expect(instance.pinnedSource).toBe('presentation');

    instance.syncParticipantPins(row(1, {self: true}));
    expect(instance.pinnedSource).toBeUndefined();
  });

  it('leaves the pins of other participants alone', () => {
    const instance = makeInstance();
    instance.syncParticipantPins(row(7, {presentation: 200}));
    instance.syncParticipantPins(row(8, {video: 300}));
    instance.syncParticipantPins(row(8));
    expect(instance.pinnedSource).toBe(200);
  });
});
