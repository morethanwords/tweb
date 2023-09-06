/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import safePlay from './dom/safePlay';

const ASSETS_PATH = 'assets/audio/';

export default class AudioAssetPlayer<AssetName extends string> {
  private audio: HTMLAudioElement;
  private tempId: number;
  private assetName: AssetName;

  constructor(private assets: AssetName[]) {
    this.tempId = 0;
  }

  public playSound(name: AssetName, loop = false) {
    ++this.tempId;
    this.assetName = name;

    try {
      const audio = this.createAudio();
      audio.autoplay = true;
      audio.src = ASSETS_PATH + name;
      audio.loop = loop;
      safePlay(audio);
    } catch(e) {
      console.error('playSound', name, e);
    }
  }

  public playSoundIfDifferent(name: AssetName, loop?: boolean) {
    if(this.assetName !== name) {
      this.playSound(name, loop);
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

  public stopSound() {
    if(!this.audio) {
      return;
    }

    this.audio.pause();
  }

  public cancelDelayedPlay() {
    ++this.tempId;
  }

  public playSoundWithTimeout(name: AssetName, loop: boolean, timeout: number) {
    // timeout = 0;
    const tempId = ++this.tempId;
    setTimeout(() => {
      if(this.tempId !== tempId) {
        return;
      }

      this.playSound(name, loop);
    }, timeout);
  }
}
