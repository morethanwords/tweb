import {createStore, unwrap} from 'solid-js/store';
import {StarGiftCollection} from '../../layer';
import {batch, onMount} from 'solid-js';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import rootScope from '../../lib/rootScope';
import {createListenerSetter} from '../stories/viewer';
import {updateStarGift} from '../../lib/appManagers/utils/gifts/updateStarGift';
import {inputStarGiftEquals} from '../../lib/appManagers/utils/gifts/inputStarGiftEquals';
import untrackActions from '../../helpers/solid/untrackActions';
import setBooleanFlag from '../../helpers/object/setBooleanFlag';

export const ALL_COLLECTIONS_ID = -1

export interface StarGiftsProfileStore {
  items: MyStarGift[]
  collections: StarGiftCollection[] | undefined
  loading: boolean
  loaded: boolean
  chosenCollection: number
  sort: 'date' | 'value'
  unlimited: boolean
  limited: boolean
  upgradable: boolean
  unique: boolean
  displayed: boolean
  hidden: boolean
  hasCollections: boolean
}

export interface StarGiftsProfileActions {
  loadNext: (reload?: boolean) => Promise<void>
  setFilters: (filters: {
    sort?: 'date' | 'value'
    chosenCollection?: number
    unlimited?: boolean
    limited?: boolean
    upgradable?: boolean
    unique?: boolean
    displayed?: boolean
    hidden?: boolean
  }) => void
  deleteCollection: (collectionId: number) => void
  handleSwipe: (xDiff: number) => boolean
  updateCollection: (collection: StarGiftCollection, options?: {
    switch: boolean
    reload: boolean
  }) => void
}


export function createProfileGiftsStore(props: {
  peerId: PeerId
  onCountChange?: (count: number) => void
}): [StarGiftsProfileStore, StarGiftsProfileActions] {
  const initialState: StarGiftsProfileStore = {
    collections: undefined,
    items: [],
    loading: false,
    loaded: false,

    chosenCollection: ALL_COLLECTIONS_ID,
    sort: 'date',
    unlimited: true,
    limited: true,
    upgradable: true,
    unique: true,
    displayed: true,
    hidden: true,
    get hasCollections() {
      return store.collections !== undefined && store.collections.length > 0;
    }
  }
  const [store, setStore] = createStore<StarGiftsProfileStore>(initialState);

  let currentOffset = '';
  let nextReqId = 0

  async function loadNext(reload = false) {
    if(!reload && (store.loading || store.loaded)) return
    setStore('loading', true);

    const id = ++nextReqId
    const collectionId = store.chosenCollection === ALL_COLLECTIONS_ID ? undefined : store.chosenCollection
    const res = await rootScope.managers.appGiftsManager.getProfileGifts({
      peerId: props.peerId,
      offset: currentOffset,
      sort: store.sort,
      unlimited: store.unlimited,
      limited: store.limited,
      upgradable: store.upgradable,
      unique: store.unique,
      displayed: store.displayed,
      hidden: store.hidden,
      withCollections: store.collections === undefined,
      collectionId,
      limit: 99 // divisible by 3 to avoid grid jumping
    });
    if(id !== nextReqId) return;
    currentOffset = res.next;
    batch(() => {
      setStore('items', reload ? res.gifts : store.items.concat(res.gifts))
      setStore('loaded', !res.next)
      setStore('loading', false)
      if(res.collections) {
        setStore('collections', res.collections)
      }
    })
    props.onCountChange?.(res.count);
  }

  function reload(background = false) {
    currentOffset = ''
    batch(() => {
      setStore('loading', true)
      setStore('loaded', false)
      if(!background) {
        setStore('items', [])
      }
    })
    loadNext(true)
  }

  const actions: StarGiftsProfileActions = {
    loadNext,
    setFilters: (filters) => {
      setStore(filters)
      reload()
    },
    deleteCollection: (collectionId) => {
      const deletingChosenCollection = store.chosenCollection === collectionId

      batch(() => {
        if(deletingChosenCollection) {
          setStore('chosenCollection', ALL_COLLECTIONS_ID)
        }
        setStore('collections', store.collections.filter((it) => it.collection_id !== collectionId))
      })

      if(deletingChosenCollection) {
        reload()
      }
    },
    updateCollection: (collection, options) => {
      const needSwitch= options?.switch ?? true
      let needReload = options?.reload ?? needSwitch

      batch(() => {
        const newArray = store.collections.slice();
        const idx = newArray.findIndex((it) => it.collection_id === collection.collection_id);
        if(idx !== -1) {
          newArray[idx] = collection;
        } else {
          newArray.push(collection);
        }
        setStore('collections', newArray);
        if(needSwitch) {
          setStore('chosenCollection', collection.collection_id)
          needReload = true
        }
      })
      if(needReload) {
        reload()
      }
    },
    handleSwipe: (xDiff: number) => {
      if(!store.hasCollections) return false
      const direction = xDiff > 0 ? 1 : -1

      const collections$ = store.collections;
      const chosenCollection$ = store.chosenCollection;
      const currentIndex =
        chosenCollection$ === ALL_COLLECTIONS_ID ? -1 :
        collections$.findIndex((it) => it.collection_id === chosenCollection$);
      const newIndex = currentIndex + direction;
      if(newIndex < -1 || newIndex >= collections$.length) return false

      setStore('chosenCollection', newIndex === -1 ? ALL_COLLECTIONS_ID : collections$[newIndex].collection_id)
      reload()

      return true
    }
  }
  untrackActions(actions as any);

  const listenerSetter = createListenerSetter()
  onMount(() => {
    listenerSetter.add(rootScope)('star_gift_update', (event) => {
      const items = unwrap(store.items);
      const idx = items.findIndex((it) => inputStarGiftEquals(it, event.input));
      if(idx !== -1) {
        const newList = items.slice();
        // create a new object to force re-render
        const newItem = {...newList[idx]};
        newList[idx] = newItem;

        updateStarGift(newItem, event);

        setStore('items', newList);
      }
    });

    listenerSetter.add(rootScope)('my_pinned_stargifts', (event) => {
      const items = unwrap(store.items).slice();
      for(let i = 0; i < items.length; i++) {
        const item = items[i];
        const shouldBePinned = event.gifts.some((it) => inputStarGiftEquals(item, it))
        const wasPinned = !!item.saved.pFlags.pinned_to_top

        if(shouldBePinned !== wasPinned) {
          items[i] = {...item} // force re-render
          setBooleanFlag(items[i].saved.pFlags, 'pinned_to_top', shouldBePinned)
        }
      }

      items.sort((a, b) => {
        if(a.saved.pFlags.pinned_to_top && !b.saved.pFlags.pinned_to_top) return -1;
        if(!a.saved.pFlags.pinned_to_top && b.saved.pFlags.pinned_to_top) return 1;
        if(a.saved.pFlags.pinned_to_top && b.saved.pFlags.pinned_to_top) {
          const idxA = event.gifts.findIndex((it) => inputStarGiftEquals(a, it))
          const idxB = event.gifts.findIndex((it) => inputStarGiftEquals(b, it))
          return idxA - idxB
        };
        return b.saved.date - a.saved.date;
      })
      setStore('items', items);
    })

    listenerSetter.add(rootScope)('star_gift_list_update', () => {
      // refetch list
      currentOffset = ''
      loadNext(true)
    })
  })

  return [store, actions]
}
