/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '@helpers/dom/clickEvent';
import {i18n, i18n_} from '@lib/langPack';
import lottieLoader, {LottieLoader} from '@lib/rlottie/lottieLoader';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import rootScope from '@lib/rootScope';
import Button from '@components/button';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import SettingSection from '@components/settingSection';
import {SliderSuperTab} from '@components/slider';
import {StoriesProfileList, profileStoriesButtonMenu} from '@components/stories/profileList';
import {StoriesSelection} from '@components/stories/selection';
import {StoriesContextActions} from '@components/stories/store';
import {createRoot} from 'solid-js';
import {getFirstChild} from '@solid-primitives/refs';

export default class AppMyStoriesTab extends SliderSuperTab {
  private stickerContainer: HTMLDivElement;
  private showArchiveBtn: HTMLButtonElement;
  private storiesActions: StoriesContextActions;
  private selection: StoriesSelection;
  public setAlbum: (albumId: number | undefined, skipAnimation?: boolean) => void;
  public isArchive: boolean;
  public chatId: ChatId;

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
      tab.chatId = this.chatId;
      tab.open();
    };

    let placeholder: HTMLElement, section: SettingSection;
    if(this.isArchive && !this.chatId) {
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

    const storiesContainer = document.createElement('div');
    storiesContainer.classList.add('search-super');

    const middleware = this.middlewareHelper.get();
    let loadPromise: Promise<any>;

    createRoot((dispose) => {
      middleware.onClean(() => {
        this.storiesActions = undefined;
        this.selection = undefined;
        dispose();
      });

      const {render: storiesList, actions, selection, setAlbum} = StoriesProfileList({
        peerId: this.chatId?.toPeerId(true) ?? rootScope.myId,
        pinned: !this.isArchive,
        archive: this.isArchive,
        scrollable: this.scrollable,
        listenerSetter: this.listenerSetter,
        withSelection: true,
        onCountChange: (length) => {
          if(placeholder) {
            placeholder.classList.toggle('hide', length > 0);
          }
        },
        onReady: () => {
          storiesContainer.append(getFirstChild(storiesList, v => v instanceof Element) as Element);
        }
      });

      this.storiesActions = actions;
      this.selection = selection;
      this.setAlbum = setAlbum;
      loadPromise = this.storiesActions.load();
    });

    const menuBtn = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [
        ...profileStoriesButtonMenu({
          peerId: rootScope.myId,
          isArchive: this.isArchive,
          slider: this.slider,
          verify: () => true,
          onAlbumCreated: (albumId) => this.setAlbum(albumId)
        }),
        {
          icon: 'select',
          text: 'Message.Context.Select',
          onClick: () => {
            this.selection.toggleSelection(true, true);
          },
          verify: () => !!(this.selection && !this.selection.isSelecting)
        }, {
          icon: 'select',
          text: 'Message.Context.Selection.Clear',
          onClick: () => {
            this.selection.cancelSelection();
          },
          verify: () => !!this.selection?.isSelecting
        }
      ]
    });

    this.header.append(menuBtn);

    this.scrollable.append(...[
      section?.container,
      storiesContainer,
      placeholder
    ].filter(Boolean));

    return Promise.all([
      !this.isArchive && p.animationData.then(async(cb) => {
        const player = await cb({
          container: this.stickerContainer,
          loop: false,
          autoplay: false,
          width: 100,
          height: 100,
          middleware
        });

        return lottieLoader.waitForFirstFrame(player);
      }),
      this.chatId && this.managers.appChatsManager.isBroadcast(this.chatId).then((isBroadcast) => {
        section = new SettingSection({
          caption: isBroadcast ? 'ProfileStoriesArchiveChannelHint' : 'ProfileStoriesArchiveGroupHint'
        });
        section.innerContainer.remove();
        this.scrollable.prepend(section.container);
      }),

      loadPromise
    ]);
  }
}
