import PopupElement, {PopupButton} from '.';
import safeAssign from '@helpers/object/safeAssign';
import Scrollable from '@components/scrollable';
import ListenerSetter from '@helpers/listenerSetter';
import {StoriesProfileList} from '@components/stories/profileList';
import {createEffect, createRoot} from 'solid-js';
import {getFirstChild} from '@solid-primitives/refs';
import {i18n} from '@lib/langPack';
import replaceContent from '@helpers/dom/replaceContent';

import styles from '@components/popups/chooseStoryPopup.module.scss';

export default class PopupChooseStory extends PopupElement<{
  finish: (result: {selected: number[]} | null) => void
}> {
  private peerId: PeerId;
  private skipAlbumId: number;

  private finished = false;
  private getSelectedIds: () => number[];

  constructor(options: {
    peerId: PeerId,
    skipAlbumId?: number
  }) {
    const confirmButton: PopupButton = {
      langKey: 'Stories.Albums.AddCount',
      langArgs: [0],
      callback: () => {
        this.finished = true;
        this.dispatchEvent('finish', {selected: this.getSelectedIds()});
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

      const {render, selection, actions} = StoriesProfileList({
        peerId: this.peerId,
        pinned: true,
        scrollable,
        listenerSetter,
        withSelection: true,
        forPicker: true,
        skipAlbumId: this.skipAlbumId
      });

      const el = getFirstChild(render, (v) => v instanceof Element) as Element;
      if(el) scrollable.append(el);

      actions.load();

      selection.toggleSelection(true, true);

      this.getSelectedIds = () => {
        const mids = selection.selectedMids.get(this.peerId);
        return mids ? [...mids] : [];
      };

      createEffect(() => {
        const count = selection.count();
        if(confirmButton.element) {
          replaceContent(confirmButton.element, i18n('Stories.Albums.AddCount', [count]));
          confirmButton.element.toggleAttribute('disabled', count === 0);
        }
      });
    });
  }
}
