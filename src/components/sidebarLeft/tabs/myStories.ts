/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import {i18n_} from '../../../lib/langPack';
import lottieLoader, {LottieLoader} from '../../../lib/rlottie/lottieLoader';
import RLottiePlayer from '../../../lib/rlottie/rlottiePlayer';
import rootScope from '../../../lib/rootScope';
import AppSearchSuper from '../../appSearchSuper.';
import Button from '../../button';
import ButtonMenuToggle from '../../buttonMenuToggle';
import SettingSection from '../../settingSection';
import {SliderSuperTab} from '../../slider'

export default class AppMyStoriesTab extends SliderSuperTab {
  private stickerContainer: HTMLDivElement;
  private showArchiveBtn: HTMLButtonElement;
  private animation: RLottiePlayer;
  private loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;
  private searchSuper: AppSearchSuper;
  public isArchive: boolean;

  public static getInitArgs() {
    return {
      animationData: lottieLoader.loadAnimationFromURLManually('UtyanStories')
    };
  }

  public init(p: ReturnType<typeof AppMyStoriesTab['getInitArgs']> = AppMyStoriesTab.getInitArgs()) {
    this.header.classList.add('with-border');
    this.container.classList.add('chat-folders-container', `${this.isArchive ? 'archive' : 'my'}-stories-container`);
    this.setTitle(this.isArchive ? 'MyStories.Archive' : 'MyStories.Title');

    const openArchive = () => {
      const tab = this.slider.createTab(AppMyStoriesTab);
      tab.isArchive = true;
      tab.open();
    };

    let placeholder: HTMLElement, section: SettingSection;
    if(this.isArchive) {
      section = new SettingSection({
        caption: 'ProfileStoriesArchiveHint'
      });
      section.innerContainer.remove();
    } else {
      placeholder = document.createElement('div');
      placeholder.classList.add('my-stories-placeholder', 'hide');

      this.stickerContainer = document.createElement('div');
      this.stickerContainer.classList.add('sticker-container');

      const caption = document.createElement('div');
      caption.classList.add('caption');
      i18n_({element: caption, key: 'MyStories.Subtitle'});

      this.showArchiveBtn = Button('btn-primary btn-color-primary btn-control', {
        text: 'MyStories.ShowArchive'
      });

      attachClickEvent(this.showArchiveBtn, openArchive, {listenerSetter: this.listenerSetter});

      placeholder.append(
        this.stickerContainer,
        caption,
        this.showArchiveBtn
      );
    }

    const menuBtn = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'archive',
        text: 'MyStories.ShowArchive',
        onClick: openArchive,
        verify: () => !this.isArchive
      }, {
        icon: 'select',
        text: 'Message.Context.Select',
        onClick: () => {
          searchSuper.selection.toggleSelection(true, true);
        },
        verify: () => !!(lastLength && !searchSuper.selection.isSelecting)
      }, {
        icon: 'select',
        text: 'Message.Context.Selection.Clear',
        onClick: () => {
          searchSuper.selection.cancelSelection();
        },
        verify: () => searchSuper.selection.isSelecting
      }]
    });

    this.header.append(menuBtn);

    let lastLength: number;
    const searchSuper = this.searchSuper = new AppSearchSuper({
      mediaTabs: [{
        inputFilter: 'inputMessagesFilterEmpty',
        name: 'Stories',
        type: 'stories'
      }],
      scrollable: this.scrollable,
      hideEmptyTabs: true,
      managers: this.managers,
      storiesArchive: this.isArchive
    });
    searchSuper.onStoriesLengthChange = (length) => {
      lastLength = length;
      if(placeholder) {
        placeholder.classList.toggle('hide', length > 0);
      }
    };
    searchSuper.setQuery({peerId: rootScope.myId});
    searchSuper.selectTab(0);

    this.middlewareHelper.onDestroy(() => {
      searchSuper.destroy();
    });

    this.scrollable.append(...[
      section?.container,
      searchSuper.container,
      placeholder
    ].filter(Boolean));

    const middleware = this.middlewareHelper.get();
    return Promise.all([
      this.loadAnimationPromise = !this.isArchive && p.animationData.then(async(cb) => {
        const player = await cb({
          container: this.stickerContainer,
          loop: false,
          autoplay: false,
          width: 100,
          height: 100,
          middleware
        });

        this.animation = player;

        return lottieLoader.waitForFirstFrame(player);
      }),

      searchSuper.load(true)
    ]);
  }
}
