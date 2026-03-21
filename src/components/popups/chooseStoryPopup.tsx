import PopupElement, {PopupButton} from '.';
import safeAssign from '@helpers/object/safeAssign';
import Scrollable from '@components/scrollable';
import ListenerSetter from '@helpers/listenerSetter';
import {StoriesProfileList} from '@components/stories/profileList';
import {StoryItem} from '@layer';
import {createEffect, createRoot, on} from 'solid-js';
import {getFirstChild} from '@solid-primitives/refs';
import {i18n} from '@lib/langPack';
import replaceContent from '@helpers/dom/replaceContent';

import styles from '@components/popups/chooseStoryPopup.module.scss';

export default class PopupChooseStory extends PopupElement<{
  finish: (result: {added: number[], removed: number[]} | null) => void
}> {
  private peerId: PeerId;
  private albumId: number;

  private finished = false;
  private getResult: () => {added: number[], removed: number[]};

  constructor(options: {
    peerId: PeerId,
    albumId: number
  }) {
    const confirmButton: PopupButton = {
      langKey: 'Confirm',
      callback: () => {
        this.finished = true;
        this.dispatchEvent('finish', this.getResult());
      }
    };

    super(styles.popup, {
      overlayClosable: true,
      closable: true,
      title: 'Stories.Albums.AddToAlbum',
      body: true,
      buttons: [
        confirmButton,
        {
          langKey: 'Cancel',
          callback: () => {
            this.finished = true;
            this.dispatchEvent('finish', null);
          }
        }
      ]
    });

    this.addEventListener('close', () => {
      if(!this.finished) {
        this.dispatchEvent('finish', null);
      }
    });

    safeAssign(this, options);
    this.construct(confirmButton);
  }

  protected construct(confirmButton: PopupButton) {
    const scrollable = new Scrollable(this.body);
    scrollable.container.classList.add('search-super'); // ! for selection
    const listenerSetter = new ListenerSetter();
    this.addEventListener('closeAfterTimeout', () => listenerSetter.removeAll());

    createRoot((dispose) => {
      this.addEventListener('closeAfterTimeout', dispose as any);

      const {render, state, selection, actions} = StoriesProfileList({
        peerId: this.peerId,
        archive: true,
        scrollable,
        listenerSetter,
        withSelection: true,
        forPicker: true
      });

      const el = getFirstChild(render, (v) => v instanceof Element) as Element;
      if(el) scrollable.append(el);

      actions.load();

      selection.toggleSelection(true, true);

      // auto-select stories already in the album as they load
      const originalIds = new Set<number>();
      createEffect(on(() => state.peer?.stories, (stories) => {
        if(!stories) return;
        for(const story of stories) {
          if(story._ === 'storyItem' && story.albums?.includes(this.albumId) && !originalIds.has(story.id)) {
            originalIds.add(story.id);
            if(!selection.isMidSelected(this.peerId, story.id)) {
              selection.toggleMid(this.peerId, story.id);
            }
          }
        }
      }));

      scrollable.onScrolledBottom = () => {
        actions.load();
      };

      this.getResult = () => {
        const currentMids = selection.selectedMids.get(this.peerId);
        const current = currentMids ? new Set(currentMids) : new Set<number>();
        const added: number[] = [];
        const removed: number[] = [];
        for(const id of current) {
          if(!originalIds.has(id)) added.push(id);
        }
        for(const id of originalIds) {
          if(!current.has(id)) removed.push(id);
        }
        return {added, removed};
      };

      createEffect(on(selection.count, () => {
        const {added, removed} = this.getResult();
        const changed = added.length || removed.length;
        if(confirmButton.element) {
          replaceContent(confirmButton.element, i18n('Confirm'));
          confirmButton.element.toggleAttribute('disabled', changed === 0 && !originalIds.size);
        }
      }));
    });
  }
}
