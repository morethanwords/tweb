import {Component, createRoot} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {i18n, i18n_} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import Button from '@components/button';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import SettingSection from '@components/settingSection';
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

  let stickerContainer: HTMLDivElement;
  let showArchiveBtn: HTMLButtonElement;
  let storiesActions: StoriesContextActions;
  let selection: StoriesSelection;
  let setAlbum: (albumId: number | undefined, skipAnimation?: boolean) => void;

  tab.header.classList.add('with-border');
  tab.container.classList.add('chat-folders-container', `${isArchive ? 'archive' : 'my'}-stories-container`);
  tab.title.replaceChildren(i18n(isArchive ? 'MyStories.Archive' : 'MyStories.Title'));

  const openArchive = () => {
    tab.slider.createTab(AppMyStoriesTab).open({...AppMyStoriesTab.getInitArgs(), isArchive: true, chatId});
  };

  let placeholder: HTMLElement, section: SettingSection;
  if(isArchive && !chatId) {
    section = new SettingSection({
      caption: 'ProfileStoriesArchiveHint'
    });
    section.innerContainer.remove();
  } else {
    placeholder = document.createElement('div');
    placeholder.classList.add('my-stories-placeholder', 'hide');

    stickerContainer = document.createElement('div');
    stickerContainer.classList.add('sticker-container');

    const caption = document.createElement('div');
    caption.classList.add('caption');
    i18n_({element: caption, key: 'MyStories.Subtitle'});

    showArchiveBtn = Button('btn-primary btn-color-primary btn-control', {
      text: 'MyStories.ShowArchive'
    });

    attachClickEvent(showArchiveBtn, openArchive, {listenerSetter: tab.listenerSetter});

    placeholder.append(
      stickerContainer,
      caption,
      showArchiveBtn
    );
  }

  const storiesContainer = document.createElement('div');
  storiesContainer.classList.add('search-super');

  const middleware = tab.middlewareHelper.get();
  let loadPromise: Promise<any>;
  let state: StoriesContextState;

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

  tab.scrollable.append(...[
    section?.container,
    storiesContainer,
    placeholder
  ].filter(Boolean));

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
      section = new SettingSection({
        caption: isBroadcast ? 'ProfileStoriesArchiveChannelHint' : 'ProfileStoriesArchiveGroupHint'
      });
      section.innerContainer.remove();
      tab.scrollable.prepend(section.container);
    }),

    loadPromise
  ]));

  return null;
};

export default MyStories;
