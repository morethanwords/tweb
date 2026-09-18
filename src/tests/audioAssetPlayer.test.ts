/*
 * `playIfDifferent` after a `stop`.
 *
 * The player remembered the last asset forever, so a sound stopped and then
 * asked for again through `playIfDifferent` never came back: a call that lost
 * its transport twice played the reconnect tone only the first time.
 */
import {describe, expect, it, vi} from 'vitest';

import AudioAssetPlayer from '@helpers/audioAssetPlayer';

const ASSETS = {connect: 'call_connect.mp3', connecting: 'voip_connecting.mp3'};

function makePlayer() {
  const player = new AudioAssetPlayer(ASSETS);
  const play = vi.spyOn(player, 'play').mockImplementation(function(this: typeof player, options) {
    // Keep the bookkeeping `playIfDifferent` reads, skip the <audio> element.
    (this as any).assetName = options.name;
  });
  return {player, play};
}

describe('AudioAssetPlayer', () => {
  it('skips a repeated playIfDifferent while the same asset is up', () => {
    const {player, play} = makePlayer();

    player.playIfDifferent({name: 'connecting', loop: true});
    player.playIfDifferent({name: 'connecting', loop: true});

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('plays the same asset again after a stop', () => {
    const {player, play} = makePlayer();

    player.playIfDifferent({name: 'connecting', loop: true});
    player.stop();
    player.playIfDifferent({name: 'connecting', loop: true});

    expect(play).toHaveBeenCalledTimes(2);
  });
});
