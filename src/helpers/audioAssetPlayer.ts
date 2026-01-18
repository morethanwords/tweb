/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import safePlay from '@helpers/dom/safePlay';
import deepEqual from '@helpers/object/deepEqual';
import tsNow from '@helpers/tsNow';

const ASSETS_PATH = 'assets/audio/';

type PlayOptions<AssetMap extends Record<string, string>> = {
  name: keyof AssetMap,
  loop?: boolean,
  volume?: number
};

export default class AudioAssetPlayer<AssetMap extends Record<string, string>> {
  private static container: HTMLElement;
  private audio: HTMLAudioElement;
  private tempId: number;
  private assetName: keyof AssetMap;
  private lastOptions: PlayOptions<AssetMap>;
  private nextAt: number;

  constructor(private assets: AssetMap) {
    this.tempId = 0;

    if(!AudioAssetPlayer.container) {
      AudioAssetPlayer.container = document.createElement('div');
      AudioAssetPlayer.container.id = 'audio-asset-player';
      document.body.append(AudioAssetPlayer.container);
    }
  }

  public play(options: PlayOptions<AssetMap>) {
    ++this.tempId;
    this.assetName = options.name;
    this.lastOptions = options;

    try {
      const audio = this.createAudio();
      audio.autoplay = true;
      audio.src = ASSETS_PATH + this.assets[options.name];
      audio.loop = options.loop ?? false;
      audio.volume = options.volume ?? 1;
      audio.setAttribute('name', options.name as string);
      AudioAssetPlayer.container.append(audio);
      safePlay(audio);
    } catch(e) {
      console.error('playSound', name, e);
    }
  }

  public playWithThrottle(options: PlayOptions<AssetMap>, throttle: number) {
    const now = tsNow();
    if(this.nextAt && now < this.nextAt && deepEqual(this.lastOptions, options)) {
      return;
    }

    this.nextAt = now + throttle;
    this.play(options);
  }

  public playIfDifferent(options: PlayOptions<AssetMap>) {
    if(this.assetName !== options.name) {
      this.play(options);
    }
  }

  public createAudio() {
    let {audio} = this;
    if(audio) {
      return audio;
    }

    audio = this.audio = new Audio();
    safePlay(audio);
    return audio;
  }

  public stop() {
    if(!this.audio) {
      return;
    }

    this.audio.pause();
  }

  public cancelDelayedPlay() {
    ++this.tempId;
  }

  public playWithTimeout(options: PlayOptions<AssetMap>, timeout: number) {
    // timeout = 0;
    const tempId = ++this.tempId;
    setTimeout(() => {
      if(this.tempId !== tempId) {
        return;
      }

      this.play(options);
    }, timeout);
  }
}
