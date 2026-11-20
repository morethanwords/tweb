import {createEffect, createResource, createSignal, For, JSX, onCleanup, onMount, Show, useContext} from 'solid-js';

import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import StickerType from '@config/stickerType';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {Document, EmojiGroup, StickerSet} from '@layer';
import I18n, {i18n} from '@lib/langPack';

import SuperStickerRenderer from '@components/emoticonsDropdown/tabs/SuperStickerRenderer';
import createMiddleware from '@helpers/solid/createMiddleware';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {ScrollableX} from '@components/scrollable';
import {IconTsx} from '@components/iconTsx';
import Space from '@components/space';

import useNormalizePoint from '@components/mediaEditor/canvas/useNormalizePoint';
import {useMediaEditorContext} from '@components/mediaEditor/context';
import insertResizableLayer from '@components/mediaEditor/insertResizableLayer';
import {ResizableLayer} from '@components/mediaEditor/types';
import {delay} from '@components/mediaEditor/utils';

import {TabContentContext} from '@components/mediaEditor/tabs/tabContent';
import {getStickerSetInputById} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import A11yButton from '@components/a11yButton';
import smoothScrollBehavior from '@helpers/dom/smoothScrollBehavior';
import createStickersSearch from '@components/emoticonsDropdown/stickersSearch';
import Modes from '@config/modes';
import rootScope from '@lib/rootScope';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import useIsMobile from '@components/mediaEditor/useIsMobile';
import {desktopActionsForCreation} from '@components/mediaEditor/native/desktopObjectActions';

export default function StickersTab() {
  const {wrapStickerSetThumb, EmoticonsSearch} = useHotReloadGuard();
  const context = useMediaEditorContext();
  const isMobile = useIsMobile();
  const {container, scrollAmount, thumbStripHost} = useContext(TabContentContext);

  const {editorState} = context;
  const managers = bindManagersToSession(context.managers);
  const session = getManagersSession(managers);
  const middleware = createMiddleware().get(() => !isSessionLeaving(session));

  const normalizePoint = useNormalizePoint();

  const [recentStickers] = createResource(() => managers.appStickersManager.getRecentStickersStickers());
  const [favoriteStickers, {refetch: reloadFavorites}] = createResource(async() => {
    if(!middleware()) return [];
    const stickers = await managers.appStickersManager.getFavedStickersStickers();
    // Keep native cross-section membership (a favorite may also be recent/in a pack),
    // but never render the same document twice within the favorites section.
    return middleware() ? [...new Map(stickers.map(doc => [doc.id, doc])).values()] : [];
  });
  const refreshFavorites = ({type}: {type: 'recent' | 'faved'}) => {
    if(type === 'faved' && middleware()) void reloadFavorites();
  };
  rootScope.addEventListener('sticker_updated', refreshFavorites);
  rootScope.addEventListener('stickers_updated', refreshFavorites);
  onCleanup(() => {
    rootScope.removeEventListener('sticker_updated', refreshFavorites);
    rootScope.removeEventListener('stickers_updated', refreshFavorites);
  });
  const [stickerSets] = createResource(() => managers.appStickersManager.getAllStickers());
  const [filteredStickers, setFilteredStickers] = createSignal<Document.document[]>();

  const [search, setSearch] = createSignal('');
  const [group, setGroup] = createSignal<EmojiGroup>();
  const [activeSet, setActiveSet] = createSignal('recent');
  const [scrolling, setScrolling] = createSignal(false);

  const [intersectionObserver, setIntersectionObserver] = createSignal<IntersectionObserver>();

  const lazyLoadQueue = new LazyLoadQueue();
  const stickerRenderer = new SuperStickerRenderer({
    regularLazyLoadQueue: lazyLoadQueue,
    group: 'none',
    managers,
    intersectionObserverInit: {root: container()},
    withLock: false
  });

  onCleanup(() => {
    stickerRenderer.destroy();
    lazyLoadQueue.clear();
  });

  async function onStickerSetThumbClick(id: string) {
    if(!middleware()) return;
    setActiveSet(String(id));
    setScrolling(true);
    container()?.querySelector(`[data-set-id="${id}"]`)?.scrollIntoView({
      behavior: smoothScrollBehavior(),
      block: 'start'
    });
    await delay(1000);
    if(middleware()) setScrolling(false);
  }

  function StickerSetThumb(props: {set: StickerSet.stickerSet}) {
    let renderContainer: HTMLElement;


    onMount(() => {
      const middleware = createMiddleware();

      wrapStickerSetThumb({
        container: renderContainer,
        group: 'none',
        autoplay: true,
        width: 30,
        height: 30,
        lazyLoadQueue,
        middleware: middleware.get(),
        set: props.set,
        managers,
        textColor: 'white'
      });
    });

    const isActive = () => String(props.set.id) === activeSet();

    return (
      <A11yButton
        ref={(el: HTMLElement) => renderContainer = el}
        class="media-editor__stickers-set-thumb"
        classList={{
          'media-editor__stickers-set-thumb--active': isActive()
        }}
        aria-label={props.set.title}
        aria-pressed={isActive()}
        onClick={() => onStickerSetThumbClick(String(props.set.id))}
      />
    );
  }

  function Sticker(props: {doc: Document.document}) {
    let container: HTMLElement;

    onMount(() => {
      const stickerMiddleware = createMiddleware().get(middleware);
      stickerRenderer.renderSticker(props.doc, container, undefined, stickerMiddleware);
      stickerRenderer.observeAnimated(container);
      onCleanup(() => stickerRenderer.unobserveAnimated(container));
    });

    function onClick() {
      if(!middleware() || blocked()) return;
      const mobile = isMobile();
      const id = context.resizableLayersSeed++;
      const transform = editorState.finalTransform;
      const newLayer = {
        id,
        position: normalizePoint([editorState.canvasSize[0] / 2, editorState.canvasSize[1] / 2]),
        rotation: -transform.rotation,
        scale: 1 / transform.scale,
        type: 'sticker',
        ...desktopActionsForCreation(context, mobile),
        sticker: props.doc
      } as ResizableLayer;

      if(thumbStripHost?.()) editorState.currentTab = 'layers';
      insertResizableLayer(context, newLayer);
    }

    const label = () => props.doc.stickerEmojiRaw || I18n.format('AttachSticker', true);
    const blocked = () => !!context.mediaState.desktopExpandedCrop && props.doc.sticker !== StickerType.Static;

    return (
      <A11yButton
        ref={(el: HTMLElement) => container = el}
        class="media-editor__stickers-grid-item"
        aria-label={label()}
        aria-disabled={blocked()}
        disabled={blocked()}
        title={blocked() ? I18n.format('MediaEditor.ExpandedCropStaticOnly', true) : undefined}
        style={{opacity: blocked() ? .4 : undefined}}
        onClick={onClick}
      />
    );
  }

  function StickerSection(props: {id: string; title: JSX.Element; documents: Document.document[]}) {
    const [label, setLabel] = createSignal<HTMLDivElement>();

    createEffect(() => {
      const observer = intersectionObserver(), element = props.documents?.length && label();
      if(observer && element) {
        observer.observe(element);
        onCleanup(() => {
          observer.unobserve(element);
        });
      }
    });

    return (
      <Show when={props.documents?.length}>
        <Space amount="16px" />
        <div ref={setLabel} data-set-id={props.id} class="media-editor__label">{props.title}</div>
        <div class="media-editor__stickers-grid">
          <For each={props.documents}>{(doc) => <Sticker doc={doc} />}</For>
        </div>
      </Show>
    );
  }

  function StickerSetSection(props: {set: StickerSet.stickerSet}) {
    const [stickers] = createResource(() => managers.appStickersManager.getStickerSet(getStickerSetInputById(props.set)));

    return (
      <StickerSection id={String(props.set.id)} title={wrapEmojiText(props.set.title)} documents={stickers()?.documents as Document.document[]} />
    );
  }

  function ThumbList() {
    let thumbsListScrollable: HTMLDivElement;

    onMount(() => {
      // * the tabs of this editor, from the tab content it is in: the strip is in no document yet (a template's clone
      // * belongs to the template's own), so its ownerDocument found nothing and the strip never showed
      const host = thumbStripHost ? thumbStripHost() :
        container().closest('.media-editor__toolbar')?.querySelector('.media-editor__tabs');
      host?.append(thumbsListScrollable);
      new ScrollableX(thumbsListScrollable);
    });
    onCleanup(() => {
      thumbsListScrollable.remove();
    });

    // * the strip is outside the panel, which its tab's leaving does not hide: it goes with the tab at once
    const visible = () => editorState.currentTab === 'stickers' && stickerSets() && !filteredStickers();
    <div
      class="media-editor__stickers-thumb-list-scrollable"
      classList={{
        'media-editor__stickers-thumb-list-scrollable--hidden': !visible(),
        'media-editor__stickers-thumb-list-scrollable--has-scroll': scrollAmount() > 8
      }}
      inert={Modes.a11y && !visible()}
      aria-hidden={!visible()}
      ref={thumbsListScrollable}
    >
      <div
        class="media-editor__stickers-thumb-list"
        role="group"
        aria-label={I18n.format('MediaEditor.StickerSets', true)}
      >
        <Show when={favoriteStickers()?.length}>
          <A11yButton
            class="media-editor__stickers-recent-button"
            classList={{'media-editor__stickers-recent-button--active': activeSet() === 'faved'}}
            aria-label={I18n.format('FavoriteStickers', true)}
            aria-pressed={activeSet() === 'faved'}
            onClick={() => onStickerSetThumbClick('faved')}
          ><IconTsx icon="savedmessages" aria-hidden={true} /></A11yButton>
        </Show>
        <Show when={recentStickers()?.length}>
          <A11yButton
            class="media-editor__stickers-recent-button"
            classList={{
              'media-editor__stickers-recent-button--active': activeSet() === 'recent'
            }}
            aria-label={I18n.format('MediaEditor.RecentlyUsed', true)}
            aria-pressed={activeSet() === 'recent'}
            onClick={() => onStickerSetThumbClick('recent')}
          >
            <IconTsx icon="recent" aria-hidden={true} />
          </A11yButton>
        </Show>
        <For each={stickerSets()?.sets}>{(set) => <StickerSetThumb set={set} />}</For>
      </div>
    </div>;
    return <></>;
  }

  createEffect(() => {
    setIntersectionObserver(
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if(!scrolling() && entry.isIntersecting) {
              const id = (entry.target as HTMLDivElement).dataset.setId;
              if(id) setActiveSet(id);
            }
          });
        },
        {
          root: container(),
          rootMargin: `0px 0px -${container().clientHeight - 100}px 0px`
        }
      )
    );

    onCleanup(() => {
      intersectionObserver()?.disconnect();
    });
  });

  let filteredEnd: HTMLDivElement;
  createEffect(() => {
    if(!middleware()) return;
    const query = search();
    const g = !query && group();
    if(!query && !g) {
      setFilteredStickers();
      return;
    }

    // * an answer for a query or a group already left behind must not land
    let active = true;
    onCleanup(() => active = false);

    if(g) {
      const promise = g._ === 'emojiGroupPremium' ?
        managers.appStickersManager.getPremiumStickers() :
        managers.appStickersManager.getStickersByEmoticon({
          emoticon: g.emoticons,
          includeServerStickers: true
        });
      promise.then((stickers) => active && middleware() && setFilteredStickers(stickers));
      return;
    }

    // * the user's own stickers first, then the server's, page by page as the grid is scrolled on
    const stickersSearch = createStickersSearch(managers, query, [], () => active && middleware());
    onCleanup(stickersSearch.destroy);
    stickersSearch.local().then((stickers): Promise<Document.document[]> | Document.document[] =>
      active && middleware() ? stickersSearch.first(stickers) : []
    ).then((stickers) => {
      if(!active || !middleware()) {
        return;
      }

      setFilteredStickers(stickers);
      stickersSearch.paginate(filteredEnd, container(), (more) => {
        if(active && middleware()) {
          setFilteredStickers((stickers) => [...stickers, ...more]);
        }
      });
    });
  });

  return (
    <>
      <ThumbList />

      <Space amount={filteredStickers() || thumbStripHost?.() ? '0px' : '48px'} />
      <Space amount="8px" />

      <div class="media-editor__sticker-search">
        <EmoticonsSearch
          type="stickers"
          onValue={(value) => {
            setSearch(value);
          }}
          onGroup={(group) => {
            setGroup(group);
          }}
          categoryColor="white"
          animatedItemGroup="none"
        />
      </div>

      <Show when={!filteredStickers()}>
        <StickerSection id="faved" title={i18n('FavoriteStickers')} documents={favoriteStickers()} />
        <StickerSection id="recent" title={i18n('MediaEditor.RecentlyUsed')} documents={recentStickers()} />
      </Show>

      <Show when={filteredStickers()}>
        <div class="media-editor__stickers-grid">
          <For each={filteredStickers()}>{(doc) => <Sticker doc={doc} />}</For>
        </div>
        <div ref={filteredEnd} />
      </Show>

      <Show when={stickerSets() && !filteredStickers()}>
        <For each={stickerSets().sets}>{(set) => <StickerSetSection set={set} />}</For>
      </Show>
    </>
  );
}
