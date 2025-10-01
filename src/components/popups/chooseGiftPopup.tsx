import {createEffect, createSignal, Match, on, Switch} from 'solid-js';
import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import rootScope from '../../lib/rootScope';

import styles from './chooseGiftPopup.module.scss';
import {createProfileGiftsStore} from '../stargifts/profileStore';
import {StarGiftsGrid} from '../stargifts/stargiftsGrid';
import Scrollable from '../scrollable2';
import {unwrap} from 'solid-js/store';
import {I18nTsx} from '../../helpers/solid/i18n';
import {PreloaderTsx} from '../putPreloader';
import {Transition} from 'solid-transition-group';

export default class PopupChooseGift extends PopupElement<{
  finish: (result: {selected: MyStarGift[], deselected: MyStarGift[]} | null) => void
}> {
  private peerId: PeerId;
  private selectedCollectionId?: number;

  private finished = false;
  private selected: () => MyStarGift[];
  private deselected: () => MyStarGift[];

  constructor(options: {
    peerId: PeerId,
    selectedCollectionId?: number
  }) {
    super(styles.popup, {
      overlayClosable: true,
      closable: true,
      title: 'StarGiftChoose',
      body: true,
      buttons: [
        {
          langKey: 'Confirm',
          callback: () => {
            this.dispatchEvent('finish', {selected: this.selected(), deselected: this.deselected()});
          }
        },
        {
          langKey: 'Cancel',
          callback: () => {
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

    this.construct()
  }

  protected async construct() {
    this.appendSolidBody(() => this._construct());
  }

  protected _construct() {
    const [store, actions] = createProfileGiftsStore({peerId: this.peerId});
    const [selected, setSelected] = createSignal<MyStarGift[]>([]);
    const [deselected, setDeselected] = createSignal<MyStarGift[]>([]);
    this.selected = selected;
    this.deselected = deselected;
    actions.loadNext();

    const isGiftSelected = (gift: MyStarGift) => {
      if(this.selectedCollectionId && gift.saved.collection_id?.includes(this.selectedCollectionId)) {
        return !deselected().includes(gift);
      }
      return selected().includes(gift);
    }

    let scrollableRef!: HTMLDivElement;
    return (
      <Transition name="fade" mode="outin">
        <Switch>
          <Match when={store.loading && store.items.length === 0}>
            <PreloaderTsx />
          </Match>
          <Match when={store.items.length === 0}>
            <div class={styles.empty}>
              <I18nTsx key="StarGiftCollectionsEmptyOther" />
            </div>
          </Match>
          <Match when={true}>
            <Scrollable ref={scrollableRef} onScrolledBottom={actions.loadNext}>
              <StarGiftsGrid
                class={styles.grid}
                items={unwrap(store.items)}
                view="profile"
                autoplay={false}
                scrollParent={scrollableRef}
                selected={isGiftSelected}
                onClick={(clickedItem) => {
                  if(this.selectedCollectionId && clickedItem.saved.collection_id?.includes(this.selectedCollectionId)) {
                    const idx = deselected().indexOf(clickedItem);
                    if(idx !== -1) {
                      setDeselected(deselected().filter((it, i) => i !== idx));
                    } else {
                      setDeselected([...deselected(), clickedItem]);
                    }
                  } else {
                    const idx = selected().indexOf(clickedItem);
                    if(idx !== -1) {
                      setSelected(selected().filter((it, i) => i !== idx));
                    } else {
                      setSelected([...selected(), clickedItem]);
                    }
                  }
                }}
              />
            </Scrollable>
          </Match>
        </Switch>
      </Transition>
    )
  }
}
