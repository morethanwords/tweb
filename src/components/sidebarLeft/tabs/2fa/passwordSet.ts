/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import Button from '../../../button';
import SettingSection from '../../../settingSection';
import {SliderSuperTab} from '../../../slider';
import wrapStickerEmoji from '../../../wrappers/stickerEmoji';
import AppSettingsTab from '../settings';

export default class AppTwoStepVerificationSetTab extends SliderSuperTab {
  public init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-set');
    this.setTitle('TwoStepVerificationPasswordSet');

    const section = new SettingSection({
      captionOld: 'TwoStepVerificationPasswordSetInfo',
      noDelimiter: true
    });

    const emoji = '🥳';
    const stickerContainer = document.createElement('div');

    wrapStickerEmoji({
      emoji,
      div: stickerContainer,
      width: 160,
      height: 160
    });

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

    this.scrollable.append(section.container);
  }
}
