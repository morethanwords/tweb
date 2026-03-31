import {createMemo, createSignal, For, Match, onMount, Show, Switch, untrack} from 'solid-js';
import rootScope from '@lib/rootScope';
import {PreloaderTsx} from '@components/putPreloader';
import PopupElement from '@components/popups';
import PopupStarGiftInfo from '@components/popups/starGiftInfo';
import {StarGiftsGrid} from '@components/stargifts/stargiftsGrid';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import CheckboxField from '@components/checkboxField';
import {AnimationList} from '@helpers/solid/animationList';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import {I18nTsx} from '@helpers/solid/i18n';
import classNames from '@helpers/string/classNames';
import {StickerTsx} from '@components/wrappers/sticker';
import {MyDocument} from '@appManagers/appDocsManager';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {IconTsx} from '@components/iconTsx';
import InputField from '@components/inputField';
import confirmationPopup, {PopupConfirmationOptions} from '@components/confirmationPopup';
import Button from '@components/buttonTsx';

import styles from '@components/stargifts/profileList.module.scss';
import {ALL_COLLECTIONS_ID, createProfileGiftsStore, StarGiftsProfileActions, StarGiftsProfileStore} from '@components/stargifts/profileStore';
import {Chat, StarGiftCollection, User} from '@layer';
import {unwrap} from 'solid-js/store';
import PopupChooseGift from '@components/popups/chooseGiftPopup';
import {MyStarGift} from '@appManagers/appGiftsManager';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';

async function openCreateCollectionPopup({actions, peerId}: {
  actions: StarGiftsProfileActions
  peerId: PeerId
}): Promise<void> {
  const buttonOptions: PopupConfirmationOptions['button'] = {
    langKey: 'Create'
  };

  const inputField = new InputField({
    maxLength: 12,
    placeholder: 'StarGiftCollectionsAddPlaceholder',
    required: true
  });

  try {
    await confirmationPopup({
      titleLangKey: 'StarGiftCollectionsAddTitle',
      descriptionLangKey: 'StarGiftCollectionsAddText',
      inputField,
      button: buttonOptions
    })
  } catch(err) {
    return
  }

  const collection = await rootScope.managers.apiManager.invokeApi('payments.createStarGiftCollection', {
    title: inputField.value,
    peer: await rootScope.managers.appPeersManager.getInputPeerById(peerId),
    stargift: []
  })

  actions.updateCollection(collection)
}

async function openRenameCollectionPopup({actions, collection, peerId}: {
  actions: StarGiftsProfileActions
  collection: StarGiftCollection
  peerId: PeerId
}): Promise<void> {
  const buttonOptions: PopupConfirmationOptions['button'] = {
    langKey: 'Edit'
  };

  const inputField = new InputField({
    maxLength: 12,
    placeholder: 'StarGiftCollectionsAddPlaceholder',
    required: true
  });
  inputField.value = collection.title

  try {
    await confirmationPopup({
      titleLangKey: 'StarGiftCollectionsRename',
      inputField,
      button: buttonOptions
    })
  } catch(err) {
    return
  }

  if(inputField.value === collection.title) return

  const newCollection = await rootScope.managers.appGiftsManager.updateCollection({
    peerId,
    collectionId: collection.collection_id,
    title: inputField.value
  })

  actions.updateCollection(newCollection, {switch: false, reload: false})
}

async function openAddGiftsPopup({actions, collectionId, peerId}: {
  actions: StarGiftsProfileActions
  collectionId: number
  peerId: PeerId
}): Promise<void> {
  const popup = PopupElement.createPopup(PopupChooseGift, {
    peerId,
    selectedCollectionId: collectionId
  })
  popup.show()

  const result = await new Promise<{selected: MyStarGift[], deselected: MyStarGift[]} | null>((resolve) => {
    popup.addEventListener('finish', resolve);
  })

  if(!result) return

  const collection = await rootScope.managers.appGiftsManager.updateCollection({
    peerId,
    collectionId,
    add: result.selected.map((it) => it.input),
    delete: result.deselected.map((it) => it.input)
  })

  actions.updateCollection(collection)
}

export function profileStarGiftsButtonMenu(props: {
  store?: StarGiftsProfileStore
  actions?: StarGiftsProfileActions
  verify: () => boolean
  peerId: PeerId
}): ButtonMenuItemOptionsVerifiable[] {
  const FILTER_GROUPS = [['unlimited', 'limited', 'upgradable', 'unique'], ['displayed', 'hidden']] as const
  type ToggleableFilter = typeof FILTER_GROUPS[number][number]
  type SetFiltersPayload = Parameters<StarGiftsProfileActions['setFilters']>[0]

  const checkboxsByFilter: Record<ToggleableFilter, CheckboxField> = {
    unlimited: new CheckboxField({checked: true}),
    limited: new CheckboxField({checked: true}),
    upgradable: new CheckboxField({checked: true}),
    unique: new CheckboxField({checked: true}),
    displayed: new CheckboxField({checked: true}),
    hidden: new CheckboxField({checked: true})
  }

  function toggleFilter(filter: ToggleableFilter) {
    const payload: SetFiltersPayload = {
      [filter]: !props.store[filter]
    }

    const nextStore = {...props.store, ...payload}

    // make sure we don't remove all filters in each group (replicate android client behavior)
    for(const group of FILTER_GROUPS) {
      let count = 0
      for(const it of group) {
        if(nextStore[it]) count++
      }
      if(count === 0) {
        for(const it of group) {
          if(it !== filter) {
            payload[it] = true
            checkboxsByFilter[it].checked = true
          }
        }
      }
    }

    props.actions.setFilters(payload)
  }
  return [
    {
      icon: 'sort_date',
      text: 'StarGiftSortByDate',
      onClick: () => props.actions.setFilters({sort: 'date'}),
      verify: () => props.verify() && props.store?.sort === 'value'
    },
    {
      icon: 'sort_price',
      text: 'StarGiftSortByValue',
      onClick: () => props.actions.setFilters({sort: 'value'}),
      verify: () => props.verify() && props.store?.sort === 'date'
    },
    {
      icon: 'folder',
      text: 'StarGiftCollectionsAdd',
      onClick: () => openCreateCollectionPopup({actions: props.actions, peerId: props.peerId}),
      verify: () => props.verify() && props.store != null && props.store.canManageGifts
    },
    {
      checkboxField: checkboxsByFilter.unlimited,
      text: 'StarGiftShowUnlimited',
      separator: true,
      onClick: () => toggleFilter('unlimited'),
      verify: () => props.verify() && props.store != null
    },
    {
      checkboxField: checkboxsByFilter.limited,
      text: 'StarGiftShowLimited',
      onClick: () => toggleFilter('limited'),
      verify: () => props.verify() && props.store != null
    },
    {
      checkboxField: checkboxsByFilter.upgradable,
      text: 'StarGiftShowUpgradable',
      onClick: () => toggleFilter('upgradable'),
      verify: () => props.verify() && props.store != null
    },
    {
      checkboxField: checkboxsByFilter.unique,
      text: 'StarGiftShowUnique',
      onClick: () => toggleFilter('unique'),
      verify: () => props.verify() && props.store != null
    },
    {
      checkboxField: checkboxsByFilter.displayed,
      text: 'StarGiftShowDisplayed',
      separator: true,
      onClick: () => toggleFilter('displayed'),
      verify: () => props.verify() && props.store != null && props.store.canManageGifts
    },
    {
      checkboxField: checkboxsByFilter.hidden,
      text: 'StarGiftShowHidden',
      onClick: () => toggleFilter('hidden'),
      verify: () => props.verify() && props.store != null && props.store.canManageGifts
    }
  ]
}

const ADD_COLLECTION_ID = -2

export function StarGiftsProfileTab(props: {
  peerId: PeerId
  scrollParent?: HTMLElement
  onCountChange?: (count: number) => void
}) {
  const [store, actions] = createProfileGiftsStore({
    peerId: props.peerId,
    onCountChange: props.onCountChange
  });

  onMount(() => actions.loadNext())

  const [direction, setDirection] = createSignal(0)
  let scrollDiff = 0
  let wrapperRef!: HTMLDivElement

  const scrollPositions = new Map<number, number>()

  const getScrollBase = () => {
    const searchSuper = wrapperRef?.closest('.search-super') as HTMLElement
    if(!searchSuper) return 0
    return searchSuper.offsetTop === 0 ? 0 : searchSuper.offsetTop - 56
  }

  const slideKeyframes = (_element: Element, removed: boolean): Keyframe[] => {
    const dir = direction()
    const yOffset = scrollDiff ? ` translateY(${scrollDiff}px)` : ''
    if(removed) {
      // AnimationList reverses these for exit; Y offset compensates scroll change
      return [
        {transform: `translateX(${-dir * 100}%)${yOffset}`},
        {transform: `translateX(0)${yOffset}`}
      ]
    }
    return [{transform: `translateX(${dir * 100}%)`}, {transform: 'translateX(0)'}]
  }

  const setCollection = (newId: number) => {
    if(newId === store.chosenCollection) return

    const collections = store.collections
    const oldIndex = store.chosenCollection === ALL_COLLECTIONS_ID ? -1 :
      (collections?.findIndex((c) => c.collection_id === store.chosenCollection) ?? -1)
    const newIndex = newId === ALL_COLLECTIONS_ID ? -1 :
      (collections?.findIndex((c) => c.collection_id === newId) ?? -1)
    const dir = newIndex > oldIndex ? 1 : newIndex < oldIndex ? -1 : 0

    const scrollable = props.scrollParent
    const scrollBase = getScrollBase()
    const oldScrollTop = scrollable?.scrollTop ?? 0
    const oldScroll = oldScrollTop - scrollBase
    if(scrollable && oldScroll >= 0) {
      scrollPositions.set(store.chosenCollection, Math.max(0, oldScroll))
    }

    if(dir) setDirection(dir)
    actions.setFilters({chosenCollection: newId})

    const newScroll = scrollPositions.get(newId) ?? 0
    const targetScrollTop = scrollBase + newScroll
    if(scrollable && oldScroll >= 0) {
      scrollDiff = targetScrollTop - oldScrollTop
      scrollable.scrollTop = targetScrollTop
    } else {
      scrollDiff = 0
    }
  }

  const collectionContent = createMemo(() => {
    store.chosenCollection
    return untrack(() => (
      <div class={styles.collectionContent}>
        <Switch>
          <Match when={store.loading && store.items.length === 0}>
            <PreloaderTsx />
          </Match>
          <Match when={store.items.length === 0 && store.chosenCollection !== ALL_COLLECTIONS_ID && store.canManageGifts}>
            <div class={/* @once */ styles.empty}>
              <I18nTsx class={/* @once */ styles.emptyTitle} key="StarGiftCollectionsEmptyTitle" />
              <I18nTsx class={/* @once */ styles.emptySubtitle} key="StarGiftCollectionsEmptySubtitle" />
              <Button
                class="btn-primary btn-color-primary btn-control"
                text="StarGiftCollectionsAddGifts"
                onClick={() => openAddGiftsPopup({
                  actions,
                  collectionId: store.chosenCollection,
                  peerId: props.peerId
                })}
              />
            </div>
          </Match>
          <Match when={store.items.length === 0}>
            <div class={/* @once */ styles.empty}>
              <I18nTsx class={/* @once */ styles.emptySubtitle} key="StarGiftCollectionsEmptyOther" />
            </div>
          </Match>
          <Match when={true}>
            <StarGiftsGrid
              class={/* @once */ styles.grid}
              items={unwrap(store.items)}
              view='profile'
              profilePeerId={props.peerId}
              canManageGifts={store.canManageGifts}
              profileCollections={store.collections ? unwrap(store.collections) : undefined}
              scrollParent={props.scrollParent}
              autoplay={false}
              onClick={(item) => {
                PopupElement.createPopup(PopupStarGiftInfo, {gift: item});
              }}
            />
          </Match>
        </Switch>
      </div>
    ))
  })

  const render = (
    <div class={classNames(styles.tab, store.hasCollections && styles.hasCollections)}>
      <Show when={store.hasCollections}>
        <ChipTabs
          class={/* @once */ styles.collections}
          value={store.chosenCollection.toString()}
          needIntersectionObserver
          onChange={(id) => {
            if(id === ADD_COLLECTION_ID.toString()) {
              openCreateCollectionPopup({actions, peerId: props.peerId})
              return false
            }
            setCollection(Number(id))
          }}
          contextMenuButtons={(id_) => {
            const id = Number(id_)
            if(id === ALL_COLLECTIONS_ID || id === ADD_COLLECTION_ID) return []


            const buttons: ButtonMenuItemOptionsVerifiable[] = [
              {
                icon: 'link',
                text: 'CopyLink',
                onClick: async() => {
                  const username = await rootScope.managers.appPeersManager.getPeerUsername(props.peerId)
                  copyTextToClipboard(`https://t.me/${username}/c/${id}`)
                  toastNew({langPackKey: 'LinkCopied'})
                },
                verify: async() => {
                  const username = await rootScope.managers.appPeersManager.getPeerUsername(props.peerId)
                  return !!username
                }
              }
            ]

            if(store.canManageGifts) {
              buttons.push(
                {
                  icon: 'add',
                  text: 'StarGiftCollectionsAddGifts',
                  onClick: () => openAddGiftsPopup({actions, collectionId: id, peerId: props.peerId})
                },
                {
                  icon: 'edit',
                  text: 'StarGiftCollectionsRename',
                  onClick: () => {
                    const collection = store.collections.find((it) => it.collection_id === id)
                    if(!collection) return
                    openRenameCollectionPopup({actions, collection, peerId: props.peerId})
                  }
                },
                {
                  icon: 'delete',
                  text: 'Delete',
                  danger: true,
                  onClick: async() => {
                    const collection = store.collections.find((it) => it.collection_id === id)
                    if(!collection) return
                    await confirmationPopup({
                      titleLangKey: 'StarGiftCollectionsDeleteTitle',
                      descriptionLangKey: 'StarGiftCollectionsDeleteAreYouSure',
                      descriptionLangArgs: [wrapEmojiText(collection.title)],
                      button: {
                        langKey: 'Delete',
                        isDanger: true
                      }
                    })
                    rootScope.managers.apiManager.invokeApi('payments.deleteStarGiftCollection', {
                      collection_id: id,
                      peer: await rootScope.managers.appPeersManager.getInputPeerById(props.peerId)
                    })
                    actions.deleteCollection(id)
                  }
                }
              )
            }

            return buttons
          }}
          view="surface"
          center
        >
          <ChipTab value={ALL_COLLECTIONS_ID.toString()}>
            <I18nTsx key="StarGiftCollectionsAll" />
          </ChipTab>
          <For each={store.collections}>
            {(collection) => (
              <ChipTab value={collection.collection_id.toString()}>
                {collection.icon && (
                  <StickerTsx
                    sticker={unwrap(collection.icon) as MyDocument}
                    width={24}
                    height={24}
                    autoStyle
                  />
                )}
                {wrapEmojiText(collection.title)}
              </ChipTab>
            )}
          </For>
          <Show when={store.canManageGifts}>
            <ChipTab value={ADD_COLLECTION_ID.toString()} class={/* @once */ styles.addCollection}>
              <IconTsx icon="add" />
              <I18nTsx key="StarGiftCollectionsAdd" />
            </ChipTab>
          </Show>
        </ChipTabs>
      </Show>

      <div ref={wrapperRef} class={styles.contentWrapper}>
        <AnimationList
          animationOptions={{duration: 250, easing: 'cubic-bezier(.4, 0, .2, 1)'}}
          keyframes={slideKeyframes}
          mode="replacement"
        >
          {collectionContent()}
        </AnimationList>
      </div>
    </div>
  );

  return {render, store, actions, setCollection};
}
