import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import rootScope from '../../../lib/rootScope';
import {PreloaderTsx} from '../../putPreloader';
import {MyStarGift} from '../../../lib/appManagers/appGiftsManager';
import {inputStarGiftEquals} from '../../../lib/appManagers/utils/gifts/inputStarGiftEquals';
import PopupElement from '../../popups';
import PopupStarGiftInfo from '../../popups/starGiftInfo';
import ListenerSetter from '../../../helpers/listenerSetter';
import {StarGiftsGrid} from '../../stargifts/stargiftsGrid';

export function StarGiftsProfileTab(props: {
  peerId: PeerId
  scrollParent?: HTMLElement
  onCountChange?: (count: number) => void
}) {
  const [list, setList] = createSignal<MyStarGift[]>([]);
  const [hasMore, setHasMore] = createSignal(true);

  let currentOffset = '';
  let isLoading = false;
  async function loadNext() {
    if(isLoading || !hasMore()) return;
    isLoading = true;
    const res = await rootScope.managers.appGiftsManager.getProfileGifts({
      peerId: props.peerId,
      offset: currentOffset,
      limit: 99 // divisible by 3 to avoid grid jumping
    });
    currentOffset = res.next;
    setList(list().concat(res.gifts));
    setHasMore(Boolean(res.next))
    props.onCountChange?.(res.count);
    isLoading = false;
  }

  function onScroll(event: Event) {
    if(!hasMore()) return;
    const el = event.target as HTMLElement;
    if(el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      loadNext();
    }
  }

  const listenerSetter = new ListenerSetter();

  onMount(() => {
    loadNext()
    listenerSetter.add(rootScope)('star_gift_update', ({input, unsaved, converted, togglePinned}) => {
      const idx = list().findIndex((it) => inputStarGiftEquals(it.input, input));
      if(idx !== -1) {
        let newList = list().slice();
        // create a new object to force re-render
        const newItem = {...newList[idx]};
        newList[idx] = newItem;

        if(unsaved !== undefined) {
          newList[idx].saved.pFlags.unsaved = unsaved ? true : undefined;
        }
        if(converted !== undefined) {
          newItem.isConverted = converted;
        }
        if(togglePinned) {
          newItem.saved.pFlags.pinned_to_top = newItem.saved.pFlags.pinned_to_top ? undefined : true;
          newList = newList.sort((a, b) => {
            if(a.saved.pFlags.pinned_to_top && !b.saved.pFlags.pinned_to_top) return -1;
            if(!a.saved.pFlags.pinned_to_top && b.saved.pFlags.pinned_to_top) return 1;
            return b.saved.date - a.saved.date;
          })
        }
        setList(newList);
      }
    });
  });

  onCleanup(() => listenerSetter.removeAll());

  const render = (
    <div class="star-gifts-profile-tab" onScroll={onScroll}>
      <Show when={!list().length && hasMore()}>
        <PreloaderTsx />
      </Show>
      <StarGiftsGrid
        items={list()}
        view='profile'
        scrollParent={props.scrollParent}
        onClick={(item) => {
          PopupElement.createPopup(PopupStarGiftInfo, item);
        }}
      />
    </div>
  );

  return {render, loadNext};
}
