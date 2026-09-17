import {createSignal, Match, Switch} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {MyStarGift} from '@appManagers/appGiftsManager';

import styles from '@components/popups/chooseGiftPopup.module.scss';
import {createProfileGiftsStore} from '@components/stargifts/profileStore';
import {StarGiftsGrid} from '@components/stargifts/stargiftsGrid';
import Scrollable from '@components/scrollable2';
import {unwrap} from 'solid-js/store';
import {I18nTsx} from '@helpers/solid/i18n';
import {PreloaderTsx} from '@components/putPreloader';
import {Transition} from 'solid-transition-group';

export default function showChooseGiftPopup(options: {
  peerId: PeerId,
  selectedCollectionId?: number,
  onFinish: (result: {selected: MyStarGift[], deselected: MyStarGift[]} | null) => void
}) {
  const {peerId, selectedCollectionId} = options;
  // closing without confirming answers `null`, but the buttons answer for themselves
  let finished = false;
  const finish = (result: {selected: MyStarGift[], deselected: MyStarGift[]} | null) => {
    finished = true;
    options.onFinish(result);
  };

  createPopup(() => {
    const [store, actions] = createProfileGiftsStore({peerId});
    const [selected, setSelected] = createSignal<MyStarGift[]>([]);
    const [deselected, setDeselected] = createSignal<MyStarGift[]>([]);
    actions.loadNext();

    const isGiftSelected = (gift: MyStarGift) => {
      if(selectedCollectionId && gift.saved.collection_id?.includes(selectedCollectionId)) {
        return !deselected().includes(gift);
      }
      return selected().includes(gift);
    };

    let scrollableRef!: HTMLDivElement;
    return (
      <PopupElement
        class={styles.popup}
        closable
        onClose={() => !finished && options.onFinish(null)}
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="StarGiftChoose" />
        </PopupElement.Header>
        <PopupElement.Body>
          <Transition name="fade" mode="outin">
            <Switch>
              <Match when={store.loading && store.items.length === 0}>
                <PreloaderTsx />
              </Match>
              <Match when={store.items.length === 0}>
                <div>
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
                      if(selectedCollectionId && clickedItem.saved.collection_id?.includes(selectedCollectionId)) {
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
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            langKey="Confirm"
            callback={() => finish({selected: selected(), deselected: deselected()})}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
