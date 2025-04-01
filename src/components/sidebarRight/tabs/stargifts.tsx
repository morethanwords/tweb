import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import {InputSavedStarGift, Message, SavedStarGift, StarGift} from '../../../layer';
import rootScope from '../../../lib/rootScope';
import {PreloaderTsx} from '../../putPreloader';
import {IntersectionObserverTsx} from '../../../helpers/solid/intersectionObserver';
import {StarGiftsGrid} from '../../stargiftsGrid';
import {MyStarGift} from '../../../lib/appManagers/appGiftsManager';
import PopupElement from '../../popups';
import PopupStarGiftInfo from '../../popups/starGiftInfo';
import ListenerSetter from '../../../helpers/listenerSetter';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';

function inputStarGiftEquals(a: InputSavedStarGift, b: InputSavedStarGift) {
  if(a._ === 'inputSavedStarGiftChat' && b._ === 'inputSavedStarGiftChat') {
    return a.saved_id === b.saved_id && getPeerId(a.peer) === getPeerId(b.peer)
  }
  if(a._ === 'inputSavedStarGiftUser' && b._ === 'inputSavedStarGiftUser') {
    return a.msg_id === b.msg_id
  }
  return false
}

export function StarGiftsProfileTab(props: {
  peerId: PeerId
  scrollParent?: HTMLElement
  onCountChange?: (count: number) => void
}) {
  const [list, setList] = createSignal<MyStarGift[]>([]);
  const [hasMore, setHasMore] = createSignal(true);

  let currentOffset = ''
  let isLoading = false
  async function loadNext() {
    if(isLoading || !hasMore()) return
    isLoading = true
    const res = await rootScope.managers.appGiftsManager.getProfileGifts({
      peerId: props.peerId,
      offset: currentOffset,
      limit: 99 // divisible by 3 to avoid grid jumping
    });
    console.log('meow', res)
    currentOffset = res.next;
    setList(list().concat(res.gifts));
    setHasMore(Boolean(res.next))
    props.onCountChange?.(res.count);
    isLoading = false
  }

  function onScroll(event: Event) {
    if(!hasMore()) return;
    const el = event.target as HTMLElement;
    if(el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      loadNext();
    }
  }

  const listenerSetter = new ListenerSetter()

  onMount(() => {
    loadNext()
    listenerSetter.add(rootScope)('star_gift_update', ({input, unsaved, converted}) => {
      const idx = list().findIndex((it) => inputStarGiftEquals(it.input, input))
      if(idx !== -1) {
        const newList = list().slice()

        if(unsaved !== undefined) {
          newList[idx].saved.pFlags.unsaved = unsaved ? true : undefined
        }
        if(converted !== undefined) {
          newList[idx].isConverted = converted
        }
        setList(newList)
      }
    })
  })

  onCleanup(() => listenerSetter.removeAll())

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
  )

  return {render, loadNext}
}
