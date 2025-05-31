/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Portal} from 'solid-js/web';
import {batch, createContext, createEffect, createRoot, For, onCleanup, onMount, useContext, JSX, createMemo, createSignal, Accessor, untrack, createResource, Resource, on, createReaction} from 'solid-js';
import styles from './browser.module.scss';
import {ButtonIconTsx} from './buttonIconTsx';
import getTextWidth from '../helpers/canvas/getTextWidth';
import {FontFull} from '../config/font';
import {createStore, reconcile, unwrap} from 'solid-js/store';
import untrackActions from '../helpers/solid/untrackActions';
import classNames from '../helpers/string/classNames';
import Scrollable from './scrollable2';
import fastSmoothScroll from '../helpers/fastSmoothScroll';
import {IconTsx} from './iconTsx';
import {ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from './buttonMenu';
import {attachContextMenuListener} from '../helpers/dom/attachContextMenuListener';
import ListenerSetter from '../helpers/listenerSetter';
import findUpClassName from '../helpers/dom/findUpClassName';
import contextMenuController from '../helpers/contextMenuController';
import positionMenu from '../helpers/positionMenu';
import copy from '../helpers/object/copy';
import {filterButtonMenuItems} from './buttonMenuToggle';
import Animated from '../helpers/solid/animations';
import WebApp, {WebAppLaunchOptions} from './webApp';
import deferredPromise from '../helpers/cancellablePromise';
import documentFragmentToNodes from '../helpers/dom/documentFragmentToNodes';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import {i18n} from '../lib/langPack';
import {avatarNew} from './avatarNew';
import {getMiddleware} from '../helpers/middleware';
import MovablePanel from '../helpers/movablePanel';
import {MovableState} from './movableElement';
import {Ref, resolveElements, resolveFirst} from '@solid-primitives/refs';
import Section from './section';
import InputSearch from './inputSearch';
import rootScope from '../lib/rootScope';
import {SimilarPeer} from './chat/similarChannels';
import SearchIndex from '../lib/searchIndex';
import {useUser} from '../stores/peers';
import {User} from '../layer';
import getPeerActiveUsernames from '../lib/appManagers/utils/peers/getPeerActiveUsernames';
import internalLinkProcessor from '../lib/appManagers/internalLinkProcessor';
import {INTERNAL_LINK_TYPE} from '../lib/appManagers/internalLink';

type BrowserPageProps = {
  title: string, // plain text
  icon: JSX.Element,
  dispose: () => void,
  titleWidth?: number,
  id?: string,
  menuButtons?: ButtonMenuItemOptionsVerifiable[],
  scrollFromPage?: BrowserPageProps,
  content?: JSX.Element,
  cacheKey?: string,

  isCatalogue?: boolean,

  isConfirmationNeededOnClose?: () => void | Promise<boolean>,
  needBackButton?: boolean,
  onBackClick?: () => void
};

function BrowserHeaderTipSvg(props: {left?: boolean, right?: boolean}) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" class={classNames(styles.BrowserHeaderSelectorTail, props.left ? styles.left : styles.right)}>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M16 16V0C16 8.83656 8.83656 16 0 16H16Z" fill="var(--surface-color)"/>
    </svg>
  );
}

function BrowserHeaderButton(props: Parameters<typeof ButtonIconTsx>[0]) {
  return (
    <ButtonIconTsx {...props} class={classNames(styles.BrowserHeaderButton, props.class)} noRipple />
  );
}

function BrowserHeaderTab(props: {
  page: BrowserPageProps,
  ref: Ref<HTMLDivElement>,
  openPageMenu: (e: MouseEvent | TouchEvent) => void,
  index: Accessor<number>
}) {
  const [state, actions] = useContext(BrowserContext);
  const isActive = createMemo(() => !state.collapsed && state.page === props.page);
  const transform = createMemo(() => {
    if(!state.collapsed) {
      return '';
    }

    const index = props.index();
    let value = -20 + Math.min(2, index) * -26;
    if(index > 2) {
      value += (index - 2) * -40;
    }

    return `translateX(${value}px)`;
  });

  return (
    <div
      ref={props.ref}
      class={classNames(
        styles.BrowserHeaderTab,
        isActive() && styles.active,
        state.pages.indexOf(props.page) === 0 && styles.first
      )}
      style={{
        '--text-width': props.page.titleWidth + 26 + 'px',
        'z-index': Math.max(1, 4 - props.index()),
        'transform': transform()
      }}
      onClick={() => actions.select(props.page)}
    >
      <BrowserHeaderButton class={styles.BrowserHeaderTabIcon}>
        <span class={styles.BrowserHeaderTabIconInner}>{props.page.icon}</span>
        <IconTsx
          icon="more"
          class={classNames(styles.BrowserHeaderTabHover, styles.BrowserHeaderTabMore)}
          onClick={props.openPageMenu}
        />
      </BrowserHeaderButton>
      <div class={styles.BrowserHeaderTabTitle}>
        {documentFragmentToNodes(wrapEmojiText(props.page.title))}
      </div>
      <div class={classNames(styles.BrowserHeaderTabHover, styles.BrowserHeaderTabMask)}></div>
      <ButtonIconTsx
        icon="close"
        class={classNames(styles.BrowserHeaderTabHover, styles.BrowserHeaderTabClose)}
        noRipple
        onClick={(e) => {
          e.stopPropagation();
          actions.close(props.page);
        }}
      />
    </div>
  );
}

function BrowserHeader(props: {
}) {
  const [state, actions] = useContext(BrowserContext);
  const needBackButton = createMemo(() => !!state.page.needBackButton);
  const tabMap: Map<string, HTMLDivElement> = new Map();

  createEffect(() => {
    const page = state.page;
    const scrollFromPage = state.page?.scrollFromPage;
    if(!scrollFromPage) {
      return;
    }

    fastSmoothScroll({
      container: scrollableRef,
      element: tabMap.get(page.id),
      position: 'center',
      axis: 'x',
      forceDuration: 200,
      getNormalSize: ({rect}) => {
        const diff = scrollFromPage.titleWidth - page.titleWidth;
        return rect.width + diff/*  + page.titleWidth */;
      }
    });
  });

  const openPageMenu = async(e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, styles.BrowserHeaderTab);
    if(!target) {
      return;
    }

    if(e instanceof MouseEvent) e.preventDefault();
    // smth
    if(e instanceof MouseEvent) e.cancelBubble = true;

    const page = state.pages.find((page) => tabMap.get(page.id) === target);
    if(!page?.menuButtons) {
      return;
    }

    const listenerSetter = new ListenerSetter();
    const buttons = (await filterButtonMenuItems(copy(page.menuButtons))).map((button) => {
      button.options = {listenerSetter};
      return button;
    });
    const element = ButtonMenuSync({
      buttons,
      listenerSetter
    });
    element.classList.add('contextmenu');

    document.getElementById('page-chats').append(element);

    positionMenu(e, element);
    contextMenuController.openBtnMenu(element, () => {
      setTimeout(() => {
        element.remove();
        listenerSetter.removeAll();
      }, 1e3);
    });
  };

  onMount(() => {
    const listenerSetter = new ListenerSetter();
    attachContextMenuListener({
      element: scrollableRef,
      callback: openPageMenu,
      listenerSetter
    });

    onCleanup(() => {
      listenerSetter.removeAll();
    });
  });

  const collapsedTitle = createMemo(() => {
    const wrapTitles = (pages: BrowserPageProps[]) => pages.map((page) => wrapEmojiText(page.title));
    const pages = state.pages;
    if(pages.length === 1) {
      return i18n('MiniApps.Collapsed.One', wrapTitles([pages[0]]));
    } else if(pages.length === 2) {
      return i18n('MiniApps.Collapsed.Two', wrapTitles(pages.slice(0, 2)));
    } else {
      return i18n('MiniApps.Collapsed.Many', [...wrapTitles([pages[0]]), pages.length - 1]);
    }
  });

  let scrollableRef: HTMLDivElement;
  return (
    <div class={styles.BrowserHeader}>
      <BrowserHeaderButton
        onClick={() => {
          if(needBackButton()) {
            state.page.onBackClick();
          } else {
            actions.close(state.page);
          }
        }}
      >
        <div class={classNames('animated-close-icon', needBackButton() && 'state-back')}></div>
      </BrowserHeaderButton>
      <Scrollable
        class={classNames(styles.BrowserHeaderTabsScrollable, state.collapsed && 'disable-hover')}
        axis="x"
        ref={scrollableRef}
        withBorders="manual"
      >
        <div class={styles.BrowserHeaderTabs}>
          <div
            class={styles.BrowserHeaderSelector}
            style={{
              transform: `translateX(${state.index * 40 + 7 + (state.index >= 1 ? 16 : 0)}px)`,
              width: state.page.titleWidth + 16 * 2 + 34 + 'px'
            }}
          >
            <BrowserHeaderTipSvg left />
            <BrowserHeaderTipSvg right />
          </div>
          <Animated type="grow-width" mode="add-remove">
            <For each={state.pages}>{(page, index) => {
              return (
                <BrowserHeaderTab
                  page={page}
                  openPageMenu={openPageMenu}
                  ref={(el) => tabMap.set(page.id, el)}
                  index={index}
                />
              );
            }}
            </For>
          </Animated>
          <BrowserHeaderButton
            class={classNames(styles.BrowserHeaderTabIcon, styles.BrowserHeaderNewButton)}
            onClick={() => openCatalogueInAppBrowser()}
          >
            <span class={styles.BrowserHeaderTabIconInner}><IconTsx icon="plus" /></span>
          </BrowserHeaderButton>
        </div>
      </Scrollable>
      <div
        class={styles.BrowserHeaderCollapsedTitle}
        style={{'--translateX': Math.max(0, 3 - state.pages.length) * -14 + 'px'}}
      >
        {collapsedTitle()}
      </div>
      <BrowserHeaderButton
        icon={state.collapsed ? 'app_expand' : 'app_shrink'}
        onClick={() => actions.toggleCollapsed()}
      />
    </div>
  );
}

type BrowserContextState = {
  pages: BrowserPageProps[],
  index: number,
  page: BrowserPageProps,
  destroyed: boolean,
  collapsed: boolean
};
type BrowserContextActions = {
  add: (page: BrowserPageProps) => void,
  select: (page: BrowserPageProps | number) => void,
  close: (page: BrowserPageProps) => void,
  destroy: () => void,
  toggleCollapsed: () => void,
  replace: (page: BrowserPageProps, originalPage: BrowserPageProps) => void
};

export type BrowserContextValue = [
  state: BrowserContextState,
  actions: BrowserContextActions
];

function createBrowserStore(props: {
  pages: BrowserPageProps[]
}): BrowserContextValue {
  const initialState: BrowserContextState = {
    pages: [],
    index: 0,
    get page() {
      return state.pages[state.index];
    },
    destroyed: false,
    collapsed: false
  };

  const [state, setState] = createStore<BrowserContextState>(initialState);

  const actions: BrowserContextActions = untrackActions({
    add: (page) => {
      page = makeBrowserPage(page);
      setState('pages', (pages) => {
        return [...pages, page];
      });
      actions.select(state.pages.length - 1);
    },
    select: (page) => {
      let newIndex: number;
      if(typeof(page) === 'number') {
        if(page < 0 || page >= state.pages.length) {
          newIndex = -1;
        } else {
          newIndex = page;
        }
      } else {
        newIndex = state.pages.indexOf(page);
      }

      if(newIndex === -1) {
        return;
      }

      batch(() => {
        const currentPage = state.page;
        const newPage = state.pages[newIndex];
        setState('index', newIndex);
        setState('pages', newIndex, 'scrollFromPage', currentPage);

        queueMicrotask(() => {
          const index = state.pages.indexOf(newPage);
          setState('pages', index, 'scrollFromPage', undefined);
        });
      });
    },
    close: async(page) => {
      const index = state.pages.findIndex((_page) => _page.id === page.id);
      if(index === -1) {
        return;
      }

      await page.isConfirmationNeededOnClose?.();

      if(state.pages.length === 1) {
        actions.destroy();
        return;
      }

      const pages = state.pages.slice();
      pages.splice(index, 1);

      let newIndex: number;
      if(index < state.index) {
        newIndex = state.index - 1;
      } else if(index === state.index) {
        newIndex = Math.min(state.index, pages.length - 1);
      }

      setState({
        pages,
        ...(newIndex !== undefined && {index: newIndex})
      });

      page.dispose();
    },
    destroy: () => {
      if(state.destroyed) {
        return;
      }

      setState('destroyed', true);
    },
    toggleCollapsed: () => {
      setState('collapsed', (v) => !v);
    },
    replace: (page, originalPage) => {
      page.id = originalPage.id;
      page = makeBrowserPage(page);
      originalPage.dispose();
      setState('pages', state.pages.findIndex((_page) => _page.id === originalPage.id), reconcile(page));
    }
  });

  props.pages.forEach(actions.add);
  setState('index', 0);

  onCleanup(() => {
    state.pages.forEach((page) => page.dispose());
  });

  return [state, actions];
}

const BrowserContext = createContext<BrowserContextValue>();
function Browser(props: {
  onExit: () => void
}) {
  const width = 480;
  const height = 640;
  const aspectRatio = width / height;
  const additionalHeight = 48;
  const minWidth = 328;
  const minHeight = height * (minWidth / width) + additionalHeight;

  const [state, actions] = lastContext = useContext(BrowserContext);
  const [movableState, setMovableState] = createSignal<MovableState>({
    width,
    height: height + additionalHeight
  });

  onMount(() => {
    const listenerSetter = new ListenerSetter();
    const movablePanel = new MovablePanel({
      listenerSetter,
      movableOptions: {
        minWidth,
        minHeight,
        element: ref,
        verifyTouchTarget: (e, type) => {
          const target = e.target;
          if(type === 'move' && (
            !findUpClassName(target, styles.BrowserHeader) ||
            findUpClassName(target, styles.BrowserHeaderButton) ||
            findUpClassName(target, styles.BrowserHeaderTab)
          )) {
            return false;
          }

          return true;
        },
        aspectRatio,
        resetTransition: true
      },
      onResize: (movableState) => {
        if(state.collapsed) {
          return;
        }

        setMovableState(movableState);
      },
      previousState: movableState()
    });

    createEffect(() => {
      const {movable} = movablePanel;
      const {collapsed} = state;
      const collapsedWidth = 328;
      const collapsedHeight = 48;
      movable.toggleResizable(!collapsed);
      movable.setMinValues(
        collapsed ? collapsedWidth : minWidth,
        collapsed ? collapsedHeight : minHeight
      );

      const previousMovableState = untrack(movableState);
      movable.state = collapsed ? {
        ...previousMovableState,
        width: collapsedWidth,
        height: collapsedHeight
      } : {
        ...movable.state,
        width: previousMovableState.width,
        height: previousMovableState.height
      };
    });

    onCleanup(() => {
      listenerSetter.removeAll();
      movablePanel.destroy();
    });
  });

  let ref: HTMLDivElement;
  const main = (
    <div ref={ref} class={classNames(styles.Browser, state.collapsed && styles.collapsed, 'movable-element')}>
      <BrowserHeader />
      <div
        class={styles.BrowserBody}
        style={{
          'width': movableState().width + 'px',
          '--browser-width': movableState().width + 'px',
          'height': movableState().height - additionalHeight + 'px'
        }}
      >
        <For each={state.pages}>{(page) => {
          return (
            <div
              class={classNames(
                styles.BrowserPage,
                state.page !== page && 'hide'
              )}
            >
              {page.content}
            </div>
          );
        }}</For>
      </div>
    </div>
  );

  const animated = (
    <Animated type="cross-fade" mode="add-remove" appear>
      {!state.destroyed && main}
    </Animated>
  );

  const child = resolveFirst(() => animated);
  createEffect(() => {
    if(!child()) {
      props.onExit();
    }
  });

  return (
    <Portal>
      {animated}
    </Portal>
  );
}

function makeBrowserPage(props: BrowserPageProps): BrowserPageProps {
  props.titleWidth ??= getTextWidth(props.title, FontFull);
  props.id ??= Math.random().toString(36).slice(2);
  props.menuButtons ??= [];
  props.menuButtons.push({
    icon: 'close',
    text: 'Close',
    onClick: () => {
      lastContext[1].close(props);
    }
  });
  return props;
}

let lastContext: BrowserContextValue;
export function openInAppBrowser(page?: BrowserPageProps) {
  if(lastContext) {
    lastContext[1].add(page);
    return;
  }

  createRoot((dispose) => {
    const pages: BrowserPageProps[] = [page];

    const store = createBrowserStore({
      pages: pages.filter(Boolean)
    });

    return (
      <BrowserContext.Provider value={store}>
        <Browser
          onExit={() => {
            lastContext = undefined;
            dispose();
          }}
        />
      </BrowserContext.Provider>
    );
  });
}

export async function openWebAppInAppBrowser(options: WebAppLaunchOptions) {
  if(lastContext && options.cacheKey) {
    const page = lastContext[0].pages.find((page) => page.cacheKey === options.cacheKey);
    if(page) {
      lastContext[1].select(page);
      return;
    }
  }

  const deferred = deferredPromise<void>();
  const [needBackButton, setNeedBackButton] = createSignal(false);
  const [destroy, setDestroy] = createSignal(false);
  const webApp = new WebApp({
    ...options,
    header: document.createElement('div'),
    title: document.createElement('div'),
    body: document.createElement('div'),
    forceHide: () => setDestroy(true),
    onBackStatus: setNeedBackButton
  });

  const title = await webApp.getTitle(true);
  webApp.init(() => deferred);

  const middlewareHelper = getMiddleware();
  const avatar = avatarNew({
    peerId: webApp.getPeerId(),
    size: 24,
    middleware: middlewareHelper.get()
  });
  await avatar.readyThumbPromise;

  return createRoot((dispose) => {
    const initialState: BrowserPageProps = {
      title,
      icon: avatar.node,
      menuButtons: webApp.getMenuButtons(),
      dispose,
      isConfirmationNeededOnClose: webApp.isConfirmationNeededOnClose,
      content: webApp.body,
      get needBackButton() {
        return needBackButton();
      },
      onBackClick: webApp.onBackClick,
      cacheKey: webApp.cacheKey
    };

    onCleanup(() => webApp.destroy());

    createEffect(() => {
      if(destroy()) {
        lastContext[1].close(initialState);
      }
    });

    queueMicrotask(() => deferred.resolve());
    // const [state, setState] = createStore<BrowserPageProps>(initialState);
    const lastState = lastContext?.[0];
    if(lastState && lastState?.page.isCatalogue) {
      lastContext[1].replace(initialState, lastContext[0].page);
    } else {
      openInAppBrowser(initialState);
    }

    createEffect(on(() => lastContext[0].collapsed, (collapsed) => {
      webApp.notifyVisible(!collapsed);
    }))
  });
}

export async function openCatalogueInAppBrowser() {
  return createRoot((dispose) => {
    const [folded, setFolded] = createSignal(true);
    const [value, setValue] = createSignal('');
    const targets = new WeakMap<HTMLElement, BotId>;
    const searchIndex = new SearchIndex<BotId>({ignoreCase: true});

    const inputSearch = new InputSearch({
      placeholder: 'MiniApps.Search',
      onChange: (value) => {
        value = value.trim();
        setValue(value);
      },
      debounceTime: 200,
      oldStyle: true
    });

    inputSearch.container.classList.add(styles.BrowserCatalogueSearch);

    const render = (botIds: BotId[], ready: () => void) => {
      const promises: Promise<any>[] = [];
      const ret = botIds.map((botId) => {
        return (
          <SimilarPeer
            ref={(el) => targets.set(el, botId)}
            peerId={botId.toPeerId(false)}
            promises={promises}
            avatarSize={64}
          />);
      });

      Promise.all(promises).then(ready);
      return ret;
    };

    const children = (items: Accessor<JSX.Element>, folded?: Accessor<boolean>) => {
      return (
        <div class={classNames(styles.BrowserCatalogueList, folded?.() && styles.folded)}>{items()}</div>
      );
    };

    const processBotIds = (botIds: BotId[]) => {
      untrack(() => {
        botIds.forEach((botId) => {
          const user = useUser(botId) as User.user;
          searchIndex.indexObjectArray(botId, [user.first_name, user.last_name, ...getPeerActiveUsernames(user)].filter(Boolean));
        });
      });

      return botIds;
    };

    const search = (
      <Section name="MiniApps.AppsSearch" noShadow>
        <Loader
          loader={() => {
            const query = value();
            return async() => {
              const result = searchIndex.search(query);
              return [...result];
            };
          }}
          render={render}
        >
          {children}
        </Loader>
      </Section>
    );

    const main = (
      <div>
        <Loader
          loader={() => {
            return async() => {
              const result = await rootScope.managers.appUsersManager.getTopPeers('bots_app');
              return processBotIds(result.map((user) => user.id.toPeerId(false)));
            };
          }}
          render={render}
        >
          {(items) => {
            const elements = resolveElements(items).toArray;
            const isMoreThanEnough = createMemo(() => elements().length > 7);
            if(!isMoreThanEnough()) {
              setFolded(false);
            }

            return (
              <Section
                name="MiniApps.Apps"
                nameRight={isMoreThanEnough() && (
                  <span onClick={() => setFolded((folded) => !folded)}>
                    {i18n(folded() ? 'MiniApps.AppsMore' : 'MiniApps.AppsLess')}
                  </span>
                )}
                noShadow
              >
                {children(items, folded)}
              </Section>
            );
          }}
        </Loader>
        <Loader
          loader={() => {
            let offset = '';
            return async() => {
              const result = await rootScope.managers.appAttachMenuBotsManager.getPopularAppBots(offset, 50);
              offset = result.nextOffset;
              return processBotIds(result.userIds);
            };
          }}
          render={render}
        >
          {(items) => {
            return items() && (
              <Section name="MiniApps.Popular" noShadow>
                {children(items)}
              </Section>
            );
          }}
        </Loader>
      </div>
    );

    const initialState: BrowserPageProps = {
      title: 'Open App',
      icon: IconTsx({icon: 'plus'}),
      dispose,
      content: (
        <Scrollable class={styles.BrowserCatalogueScrollable}>
          <div
            class={styles.BrowserCatalogue}
            onClick={(e) => {
              const target = findUpClassName(e.target as HTMLElement, 'similar-channels-channel');
              if(!target) {
                return;
              }

              const botId = targets.get(target);
              internalLinkProcessor.processWebAppLink({
                _: INTERNAL_LINK_TYPE.WEB_APP,
                appname: '',
                domain: getPeerActiveUsernames(useUser(botId) as User.user)[0]
              });
              // lastContext[1].close(initialState);
            }}
          >
            {inputSearch.container}
            <Animated type="cross-fade">
              {value() ? search : main}
            </Animated>
          </div>
        </Scrollable>
      ),
      isCatalogue: true
    };

    openInAppBrowser(initialState);
    // queueMicrotask(() => deferred.resolve());
  });
}

function Loader<T>(props: {
  loader: () => () => Promise<T>,
  render: (item: T, ready: () => void) => JSX.Element,
  children: (items: Accessor<JSX.Element>) => JSX.Element,
  onReady?: () => void
}) {
  const loader = createMemo(props.loader);
  const [ready, setReady] = createSignal(false);
  const [rendered, setRendered] = createSignal<JSX.Element[]>(undefined, {equals: false});

  const loadMore = (first?: boolean) => {
    const _loader = loader();
    const [result, setResult] = createSignal<T>();
    _loader().then(setResult);

    createReaction(() => {
      const onReady = () => {
        setRendered((v) => {
          if(first) {
            return [rendered];
          }

          return [...v, rendered];
        });

        props.onReady?.();
        setReady(true);
      };

      let returned = false;
      const rendered = props.render(result(), () => {
        if(returned) {
          onReady();
        } else {
          returned = true;
        }
      });

      if(returned) {
        onReady();
      } else {
        returned = true;
      }
    })(result);
  };

  createEffect(on(loader, () => loadMore(true)));

  return (
    <>
      {ready() && props.children(rendered)}
    </>
  );
}
