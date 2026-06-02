import {Component, createRoot, createSignal, onMount, Show} from 'solid-js';
import {i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Button from '@components/buttonTsx';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import Section from '@components/section';
import {StoriesProfileList, profileStoriesButtonMenu} from '@components/stories/profileList';
import {StoriesSelection} from '@components/stories/selection';
import {StoriesContextActions, StoriesContextState} from '@components/stories/store';
import {getFirstChild} from '@solid-primitives/refs';
import {AppMyStoriesTab} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

const MyStories: Component = () => {
  const [tab] = useSuperTab<typeof AppMyStoriesTab>();
  const promiseCollector = usePromiseCollector();
  const {lottieLoader} = useHotReloadGuard();
  const p = tab.payload;

  const isArchive = !!p.isArchive;
  const chatId = p.chatId;
  const initialAlbumId = p.initialAlbumId;

  let stickerContainer!: HTMLDivElement;
  let placeholder: HTMLDivElement;
  let storiesContainer!: HTMLDivElement;
  let storiesActions: StoriesContextActions;
  let selection: StoriesSelection;
  let setAlbum: (albumId: number | undefined, skipAnimation?: boolean) => void;
  let state: StoriesContextState;

  const showPlaceholder = !(isArchive && !chatId);
  const [archiveCaption, setArchiveCaption] = createSignal<LangPackKey>(
    isArchive && !chatId ? 'ProfileStoriesArchiveHint' : undefined
  );

  const openArchive = () => {
    tab.slider.createTab(AppMyStoriesTab).open({...AppMyStoriesTab.getInitArgs(), isArchive: true, chatId});
  };

  onMount(() => {
    tab.header.classList.add('with-border');
    tab.container.classList.add('chat-folders-container', `${isArchive ? 'archive' : 'my'}-stories-container`);

    const middleware = tab.middlewareHelper.get();
    let loadPromise: Promise<any>;

    createRoot((dispose) => {
      middleware.onClean(() => {
        storiesActions = undefined;
        selection = undefined;
        dispose();
      });

      const {render: storiesList, actions, selection: selection_, setAlbum: setAlbum_, state: state_} = StoriesProfileList({
        peerId: chatId?.toPeerId(true) ?? rootScope.myId,
        pinned: !isArchive,
        archive: isArchive,
        initialAlbumId: initialAlbumId,
        scrollable: tab.scrollable,
        listenerSetter: tab.listenerSetter,
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

      storiesActions = actions;
      selection = selection_;
      setAlbum = setAlbum_;
      (tab as any).setAlbum = setAlbum_;
      state = state_;
      loadPromise = storiesActions.load();
    });

    tab.scrollable.onScrolledBottom = () => {
      storiesActions.load();
    };

    const menuBtn = ButtonMenuToggle({
      listenerSetter: tab.listenerSetter,
      direction: 'bottom-left',
      buttons: [
        ...profileStoriesButtonMenu({
          peerId: rootScope.myId,
          isArchive: isArchive,
          slider: tab.slider,
          verify: () => true,
          onAlbumCreated: (albumId) => setAlbum(albumId),
          canEdit: () => state.canEdit
        }),
        {
          icon: 'select',
          text: 'Message.Context.Select',
          onClick: () => {
            selection.toggleSelection(true, true);
          },
          verify: () => !!(selection && !selection.isSelecting)
        }, {
          icon: 'select',
          text: 'Message.Context.Selection.Clear',
          onClick: () => {
            selection.cancelSelection();
          },
          verify: () => !!selection?.isSelecting
        }
      ]
    });

    tab.header.append(menuBtn);

    promiseCollector.collect(Promise.all([
      !isArchive && p.animationData.then(async(cb) => {
        const player = await cb({
          container: stickerContainer,
          loop: false,
          autoplay: false,
          width: 100,
          height: 100,
          middleware
        });

        return lottieLoader.waitForFirstFrame(player);
      }),
      chatId && tab.managers.appChatsManager.isBroadcast(chatId).then((isBroadcast) => {
        setArchiveCaption(isBroadcast ? 'ProfileStoriesArchiveChannelHint' : 'ProfileStoriesArchiveGroupHint');
      }),

      loadPromise
    ]));
  });

  return (
    <>
      <Show when={archiveCaption()}>
        <Section caption={archiveCaption()} noShadow />
      </Show>
      <div ref={storiesContainer} class="search-super" />
      <Show when={showPlaceholder}>
        <div ref={placeholder} class="my-stories-placeholder hide">
          <div ref={stickerContainer} class="sticker-container" />
          <div class="caption">{i18n('MyStories.Subtitle')}</div>
          <Button
            class="btn-primary btn-color-primary btn-control"
            text="MyStories.ShowArchive"
            onClick={openArchive}
          />
        </div>
      </Show>
    </>
  );
};

export default MyStories;
