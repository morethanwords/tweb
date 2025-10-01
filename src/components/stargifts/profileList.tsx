import {For, Match, onMount, Show, Switch} from 'solid-js';
import rootScope from '../../lib/rootScope';
import {PreloaderTsx} from '../putPreloader';
import PopupElement from '../popups';
import PopupStarGiftInfo from '../popups/starGiftInfo';
import {StarGiftsGrid} from './stargiftsGrid';
import {ButtonMenuItemOptionsVerifiable} from '../buttonMenu';
import CheckboxField from '../checkboxField';
import {Transition} from 'solid-transition-group';
import {ChipTab, ChipTabs} from '../chipTabs';
import {I18nTsx} from '../../helpers/solid/i18n';
import classNames from '../../helpers/string/classNames';
import {StickerTsx} from '../wrappers/sticker';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {IconTsx} from '../iconTsx';
import InputField from '../inputField';
import confirmationPopup, {PopupConfirmationOptions} from '../confirmationPopup';
import Button from '../buttonTsx';

import styles from './profileList.module.scss';
import {ALL_COLLECTIONS_ID, createProfileGiftsStore, StarGiftsProfileActions, StarGiftsProfileStore} from './profileStore';
import {Chat, StarGiftCollection, User} from '../../layer';
import {unwrap} from 'solid-js/store';
import PopupChooseGift from '../popups/chooseGiftPopup';
import {MyStarGift} from '../../lib/appManagers/appGiftsManager';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toastNew} from '../toast';

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
  const self = props.peerId === rootScope.myId;
  return [
    {
      icon: 'sort_date',
      text: 'StarGiftSortByDate',
      onClick: () => props.actions.setFilters({sort: 'date'}),
      verify: () => props.store?.sort === 'value'
    },
    {
      icon: 'sort_price',
      text: 'StarGiftSortByValue',
      onClick: () => props.actions.setFilters({sort: 'value'}),
      verify: () => props.store?.sort === 'date'
    },
    {
      icon: 'folder',
      text: 'StarGiftCollectionsAdd',
      onClick: () => openCreateCollectionPopup({actions: props.actions, peerId: props.peerId}),
      verify: () => props.store != null && self
    },
    {
      checkboxField: checkboxsByFilter.unlimited,
      text: 'StarGiftShowUnlimited',
      separator: true,
      onClick: () => toggleFilter('unlimited'),
      verify: () => props.store != null
    },
    {
      checkboxField: checkboxsByFilter.limited,
      text: 'StarGiftShowLimited',
      onClick: () => toggleFilter('limited'),
      verify: () => props.store != null
    },
    {
      checkboxField: checkboxsByFilter.upgradable,
      text: 'StarGiftShowUpgradable',
      onClick: () => toggleFilter('upgradable'),
      verify: () => props.store != null
    },
    {
      checkboxField: checkboxsByFilter.unique,
      text: 'StarGiftShowUnique',
      onClick: () => toggleFilter('unique'),
      verify: () => props.store != null
    },
    {
      checkboxField: checkboxsByFilter.displayed,
      text: 'StarGiftShowDisplayed',
      separator: true,
      onClick: () => toggleFilter('displayed'),
      verify: () => props.store != null && self
    },
    {
      checkboxField: checkboxsByFilter.hidden,
      text: 'StarGiftShowHidden',
      onClick: () => toggleFilter('hidden'),
      verify: () => props.store != null && self
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
  const self = props.peerId === rootScope.myId;

  onMount(() => actions.loadNext())

  const render = (
    <div class={classNames(styles.tab, store.hasCollections && styles.hasCollections)}>
      <Show when={store.hasCollections}>
        <ChipTabs
          class={/* @once */ styles.collections}
          value={store.chosenCollection.toString()}
          onChange={(id) => {
            if(id === ADD_COLLECTION_ID.toString()) {
              openCreateCollectionPopup({actions, peerId: props.peerId})
              return false
            }
            if(Number(id) === store.chosenCollection) return false

            actions.setFilters({chosenCollection: Number(id)})
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

            if(props.peerId === rootScope.myId) {
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
          <Show when={self}>
            <ChipTab value={ADD_COLLECTION_ID.toString()} class={/* @once */ styles.addCollection}>
              <IconTsx icon="add" />
              <I18nTsx key="StarGiftCollectionsAdd" />
            </ChipTab>
          </Show>
        </ChipTabs>
      </Show>

      <Transition name="fade" mode="outin">
        <Switch>
          <Match when={store.loading && store.items.length === 0}>
            <PreloaderTsx />
          </Match>
          <Match when={store.items.length === 0 && store.chosenCollection !== ALL_COLLECTIONS_ID && self}>
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
              scrollParent={props.scrollParent}
              autoplay={false}
              onClick={(item) => {
                PopupElement.createPopup(PopupStarGiftInfo, {gift: item});
              }}
            />
          </Match>
        </Switch>
      </Transition>
    </div>
  );

  return {render, store, actions};
}

