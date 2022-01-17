/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

const ASSETS_PATH = 'assets/audio/';

export default class AudioAssetPlayer<AssetName extends string> {
  private audio: HTMLAudioElement;
  private tempId: number;

  constructor(private assets: AssetName[]) {
    this.tempId = 0;
  }

  public playSound(name: AssetName, loop = false) {
    ++this.tempId;
    
    try {
      const audio = this.createAudio();
      audio.autoplay = true;
      audio.src = ASSETS_PATH + name;
      audio.loop = loop;
      audio.play();
    } catch(e) {
      console.error('playSound', name, e);
    }
  }

  public createAudio() {
    let {audio} = this;
    if(audio) {
      return audio;
    }

    audio = this.audio = new Audio();
    audio.play();
    return audio;
  }

  public stopSound() {
    this.audio?.pause();
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
