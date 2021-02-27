import { SettingSection } from "../..";
import { attachClickEvent } from "../../../../helpers/dom";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import Button from "../../../button";
import SidebarSlider, { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import AppSettingsTab from "../settings";

export default class AppTwoStepVerificationSetTab extends SliderSuperTab {
  constructor(slider: SidebarSlider) {
    super(slider, true);
  }

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-set');
    this.title.innerHTML = 'Password Set!';

    const section = new SettingSection({
      caption: 'This password will be required when you log in on a new device in addition to the code you get via SMS.',
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
        height: 160,
        emoji
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

    const btnReturn = Button('btn-primary btn-color-primary', {text: 'RETURN TO SETTINGS'});

    attachClickEvent(btnReturn, (e) => {
      this.close();
    });

    this.slider.sliceTabsUntilTab(AppSettingsTab, this);

    inputWrapper.append(btnReturn);

    inputContent.append(inputWrapper);

    this.scrollable.container.append(section.container);
  }
}
