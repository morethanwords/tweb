/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "../..";
import { attachClickEvent } from "../../../../helpers/dom/clickEvent";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import Button from "../../../button";
import { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import AppSettingsTab from "../settings";

export default class AppTwoStepVerificationSetTab extends SliderSuperTab {
  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-set');
    this.setTitle('TwoStepVerificationPasswordSet');

    const section = new SettingSection({
      caption: 'TwoStepVerificationPasswordSetInfo',
      noDelimiter: true
    });

    const emoji = '🥳';
    const doc = appStickersManager.getAnimatedEmojiSticker(emoji);
    const stickerContainer = document.createElement('div');

    if(doc) {
      wrapSticker({
        doc,
        div: stickerContainer,
        loop: true,
        play: true,
        width: 160,
        height: 160
      }).then(() => {
        // this.animation = player;
      });
    } else {
      stickerContainer.classList.add('media-sticker-wrapper');
    }

    section.content.append(stickerContainer);

    const inputContent = section.generateContentElement();

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const btnReturn = Button('btn-primary btn-color-primary', {text: 'TwoStepVerificationPasswordReturnSettings'});

    attachClickEvent(btnReturn, (e) => {
      this.close();
    });

    this.slider.sliceTabsUntilTab(AppSettingsTab, this);

    inputWrapper.append(btnReturn);

    inputContent.append(inputWrapper);

    this.scrollable.container.append(section.container);
  }
}
