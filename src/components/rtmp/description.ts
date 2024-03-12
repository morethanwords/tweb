/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {numberThousandSplitterForWatching} from '../../helpers/number/numberThousandSplitter';
import {RtmpCallInstance} from '../../lib/calls/rtmpCallsController';
import RTMP_STATE from '../../lib/calls/rtmpState';
import I18n, {FormatterArguments, LangPackKey, i18n} from '../../lib/langPack';

export default class RtmpDescriptionElement {
  private descriptionIntl: I18n.IntlElement;
  private liveTextElement: HTMLElement;

  constructor(private appendTo: HTMLElement, private appendLiveTo: HTMLElement) {
    this.descriptionIntl = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    this.descriptionIntl.element.classList.add('rtmp-description');
    this.liveTextElement = i18n('Rtmp.MediaViewer.Live');
  }

  public detach() {
    this.descriptionIntl.element.remove();
    this.liveTextElement.remove();
  }

  public update(instance: RtmpCallInstance) {
    let key: LangPackKey, args: FormatterArguments;
    if(instance.state !== RTMP_STATE.PLAYING) {
      key = 'VoiceChat.Status.Connecting';
    } else {
      key = 'Rtmp.Watching';
      args = [numberThousandSplitterForWatching(instance.call.participants_count)];
    }

    const {descriptionIntl} = this;
    descriptionIntl.compareAndUpdate({
      key,
      args
    });

    if(!this.descriptionIntl.element.parentElement) {
      this.appendTo.append(this.descriptionIntl.element);
    }

    if(!this.liveTextElement.parentElement) {
      this.appendLiveTo.append(this.liveTextElement);
    }
  }
}
