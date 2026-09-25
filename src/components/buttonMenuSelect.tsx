import {resolveFirst} from '@solid-primitives/refs'
import {getAppWindow, getOverlayRoot} from '@helpers/appWindow'
import {ComponentProps, createEffect, createMemo, createRoot, createSignal, For, JSX, on, onCleanup, onMount, Show, splitProps} from 'solid-js'
import {attachClickEvent} from '@helpers/dom/clickEvent'
import buttonKeyDown from '@helpers/solid/buttonKeyDown'
import {IconTsx} from '@components/iconTsx'
import contextMenuController from '@helpers/contextMenuController'
import {ButtonMenuDirection} from '@components/buttonMenuToggle'
import {doubleRaf, fastRafPromise} from '@helpers/schedulers';
import {I18nTsx} from '@helpers/solid/i18n'
import {i18n} from '@lib/langPack'
import Scrollable from '@components/scrollable2'
import LazyLoadQueue from '@components/lazyLoadQueue'
import SuperStickerRenderer from '@components/emoticonsDropdown/tabs/SuperStickerRenderer'
import rootScope from '@lib/rootScope'
import classNames from '@helpers/string/classNames'
import {
  DEFAULT_MENU_WINDOW_MARGIN,
  type FloatingMenuDirection,
  type FloatingMenuPositionOptions,
  positionFloatingMenu,
  positionMenuTrigger
} from '@helpers/positionMenu'

type HighlightPosition = {start: number, end: number}

function normalizeSearchText(text: string) {
  let normalized = '';
  const sourcePositions: number[] = [];

  for(let i = 0; i < text.length; ++i) {
    const normalizedCharacter = text[i].toLowerCase().replace(/[\s+/\\_-]/g, '');
    for(let j = 0; j < normalizedCharacter.length; ++j) {
      normalized += normalizedCharacter[j];
      sourcePositions.push(i);
    }
  }

  return {normalized, sourcePositions};
}

function findButtonMenuSelectHighlight(text: string, search: string): HighlightPosition | undefined {
  const normalizedSearch = normalizeSearchText(search).normalized;
  if(!normalizedSearch) return;

  const normalizedText = normalizeSearchText(text);
  const index = normalizedText.normalized.indexOf(normalizedSearch);
  if(index === -1) return;

  const start = normalizedText.sourcePositions[index];
  const last = normalizedText.sourcePositions[index + normalizedSearch.length - 1];
  if(start === undefined || last === undefined) return;
  return {start, end: last + 1};
}

export function ButtonMenuSelectText(props: {
  text: string
  highlight?: HighlightPosition
}) {
  function content(): JSX.Element {
    if(!props.highlight) {
      return props.text;
    }

    const {start, end} = props.highlight;
    const parts: JSX.Element[] = [];

    if(start > 0) {
      parts.push(
        <span class="btn-menu-select-text-faded">
          {props.text.slice(0, start)}
        </span>
      );
    }

    parts.push(props.text.slice(start, end));

    if(end < props.text.length) {
      parts.push(
        <span class="btn-menu-select-text-faded">
          {props.text.slice(end)}
        </span>
      );
    }

    return parts;
  }

  return <>{content()}</>;
}

function ButtonMenuSelectInner<T>(props: {
  class?: string
  value: T[]
  onValueChange: (value: T[]) => void
  options: T[]
  needStickerRenderer?: boolean
  stickerOptions?: SuperStickerRenderer['visibleRenderOptions']
  renderOption: (params: {
    option: T,
    chosen: boolean
    stickerRenderer?: SuperStickerRenderer
    highlight?: HighlightPosition
    optionText?: string
  }) => JSX.Element
  optionSearchText?: (option: T) => string
  optionKey: (option: T) => string
  deselectAllOnFirstSelect?: boolean
  emptyText?: string
  single?: boolean
}) {
  const [search, setSearch] = createSignal('')

  const hasSearch = !!props.optionSearchText;

  type FilteredOption = {
    option: T
    highlight?: HighlightPosition
  }
  const filteredOptions = createMemo<FilteredOption[]>(() => {
    const search$ = search();
    const options = props.options;
    if(search$ === '' || !hasSearch) {
      return options.map(option => ({
        option
      }));
    }

    const normalizedSearch = normalizeSearchText(search$).normalized;
    if(!normalizedSearch) {
      return options.map(option => ({
        option
      }));
    }

    const results: FilteredOption[] = [];

    for(const option of options) {
      const optionText = props.optionSearchText(option);
      const highlight = findButtonMenuSelectHighlight(optionText, search$);
      if(highlight) results.push({option, highlight});
    }

    return results;
  })
  const chosenKeys = createMemo(() => {
    const chosen$ = props.value;
    return new Set(chosen$.map(it => props.optionKey(it)))
  })
  const empty = createMemo(() => !!props.emptyText && !filteredOptions().length)

  let scrollable: HTMLDivElement;
  const lazyLoadQueue = props.needStickerRenderer ? new LazyLoadQueue() : undefined;
  const stickerRenderer = props.needStickerRenderer ? new SuperStickerRenderer({
    regularLazyLoadQueue: lazyLoadQueue,
    group: 'none',
    managers: rootScope.managers,
    intersectionObserverInit: {root: scrollable},
    visibleRenderOptions: {
      play: false,
      width: 20,
      height: 20,
      ...props.stickerOptions
    },
    withLock: false
  }) : undefined;

  onCleanup(() => {
    stickerRenderer?.destroy();
    lazyLoadQueue?.clear();
  });

  let inputEl: HTMLInputElement;
  onMount(() => doubleRaf().then(() => inputEl?.focus()))

  function focusSearchFromStaticArea(event: MouseEvent) {
    if(!hasSearch || !inputEl) return;
    const target = event.target as HTMLElement;
    if(target === inputEl) return;
    const item = target.closest?.('.btn-menu-item');
    if(
      item &&
      !item.classList.contains('btn-menu-search') &&
      !item.classList.contains('is-static')
    ) return;
    inputEl.focus({preventScroll: true});
  }

  return (
    <div
      class={classNames('btn-menu', 'btn-menu-select', props.class)}
      onClick={focusSearchFromStaticArea}
    >
      <Show when={hasSearch}>
        <div class="btn-menu-item btn-menu-search">
          <IconTsx icon="search" class="btn-menu-item-icon" />
          <input
            type="text"
            class="btn-menu-item-input"
            placeholder={i18n('Search').textContent}
            value={search()}
            onInput={e => setSearch(e.currentTarget.value)}
            ref={inputEl}
          />
        </div>
        <div class="btn-menu-search-delimiter" />
      </Show>
      <div
        class="btn-menu-search-scrollable"
        style={{
          height: `${10 + Math.min(
            filteredOptions().length + (props.single ? 0 : 1) + (empty() ? 1 : 0),
            7.5
          ) * 32}px`
        }}
      >
        <Scrollable axis="y" ref={scrollable}>
          <div role="listbox" aria-multiselectable={!props.single}>
            <Show when={!props.single}>
              <div
                class="btn-menu-item"
                role="option"
                aria-selected={props.value.length === props.options.length}
                tabIndex="0"
                onClick={() => props.onValueChange(props.options)}
                onKeyDown={buttonKeyDown}
              >
                <IconTsx icon="checkround" class="btn-menu-item-icon" />
                <I18nTsx class="btn-menu-item-text" key='SelectAll2' />
              </div>
            </Show>
            <For each={filteredOptions()}>
              {filteredOption => (
                <div
                  class="btn-menu-item"
                  role="option"
                  aria-selected={chosenKeys().has(props.optionKey(filteredOption.option))}
                  tabIndex="0"
                  onClick={() => {
                    const optionKey = props.optionKey(filteredOption.option)
                    const wasChosen = chosenKeys().has(optionKey)

                    if(props.deselectAllOnFirstSelect && props.value.length === props.options.length) {
                      props.onValueChange([filteredOption.option])
                      return
                    }

                    if(wasChosen) {
                      props.onValueChange(props.value.filter(it => props.optionKey(it) !== optionKey))
                    } else if(props.single) {
                      props.onValueChange([filteredOption.option])
                    } else {
                      props.onValueChange([...props.value, filteredOption.option])
                    }
                  }}
                  onKeyDown={buttonKeyDown}
                >
                  {props.renderOption({
                    option: filteredOption.option,
                    get chosen() {
                      return chosenKeys().has(props.optionKey(filteredOption.option))
                    },
                    stickerRenderer,
                    highlight: filteredOption.highlight,
                    optionText: props.optionSearchText?.(filteredOption.option)
                  })}
                </div>
              )}
            </For>
          </div>
          <Show when={empty()}>
            <div class="btn-menu-item is-static" aria-disabled="true">
              <span class="btn-menu-item-icon" />
              <span class="btn-menu-item-text">{props.emptyText}</span>
            </div>
          </Show>
        </Scrollable>
      </div>
    </div>
  )
}

export function createButtonMenuSelect<T>(props: ComponentProps<typeof ButtonMenuSelectInner<T>> & {
  floatingDirection?: FloatingMenuDirection
  floatingOptions?: FloatingMenuPositionOptions & {constrainHeight?: boolean}
  onToggleMenu?: (open: boolean) => void
  direction: ButtonMenuDirection
}) {
  type MenuInstance = {
    dispose: () => void
    element: HTMLElement
    removed?: boolean
    removeClickListener?: () => void
    removeTimeout?: number
  }

  let currentMenu: MenuInstance;
  let destroyed = false;
  let tempId = 0
  let opened = false

  function removeMenu(menu: MenuInstance) {
    if(menu.removed) return;
    menu.removed = true;
    if(menu.removeTimeout) {
      clearTimeout(menu.removeTimeout);
      menu.removeTimeout = undefined;
    }
    menu.removeClickListener?.();
    menu.element.remove();
    menu.dispose();
    if(currentMenu === menu) currentMenu = undefined;
  }

  function close() {
    ++tempId;
    if(opened) {
      opened = false
      contextMenuController.close()
    } else if(currentMenu) {
      removeMenu(currentMenu)
    }
  }

  async function open(triggerEl: HTMLElement) {
    if(destroyed || opened) return;
    if(currentMenu) removeMenu(currentMenu)
    const _tempId = ++tempId;

    await fastRafPromise();
    if(destroyed || _tempId !== tempId) return;

    let disposeMenu: () => void;
    const el = createRoot((dispose) => {
      disposeMenu = dispose
      const [, innerProps] = splitProps(props, [
        'direction',
        'floatingDirection',
        'floatingOptions',
        'onToggleMenu'
      ])

      return <ButtonMenuSelectInner {...innerProps} />
    })
    const domEl = typeof el === 'function' ? (el as () => HTMLElement)() : el as HTMLElement
    const menu: MenuInstance = currentMenu = {
      dispose: disposeMenu,
      element: domEl
    };

    if(props.single) {
      menu.removeClickListener = attachClickEvent(domEl, (event) => {
        const target = event.target as HTMLElement;
        const item = target?.closest?.('.btn-menu-item');
        if(
          !item ||
          item.classList.contains('btn-menu-search') ||
          item.classList.contains('is-static')
        ) return;
        close();
      })
    }

    domEl.classList.add(props.direction)
    getOverlayRoot().append(domEl)
    if(props.floatingDirection) {
      const triggerRect = triggerEl.getBoundingClientRect()
      const offset: [number, number] = [0, 8]
      if(props.floatingOptions?.constrainHeight) {
        const side = props.floatingDirection.split('-')[0]
        const appWindow = triggerEl.ownerDocument.defaultView || getAppWindow()
        let maxHeight = appWindow.innerHeight - DEFAULT_MENU_WINDOW_MARGIN * 2
        if(side === 'bottom') {
          maxHeight = appWindow.innerHeight - DEFAULT_MENU_WINDOW_MARGIN -
            triggerRect.bottom - offset[1]
        } else if(side === 'top') {
          maxHeight = triggerRect.top - DEFAULT_MENU_WINDOW_MARGIN - offset[1]
        }
        domEl.classList.add('is-height-constrained')
        domEl.style.maxHeight = `${Math.max(0, maxHeight)}px`
      }
      positionFloatingMenu(
        triggerRect,
        domEl,
        props.floatingDirection,
        offset,
        {flip: props.floatingOptions?.flip}
      )
    } else {
      positionMenuTrigger(triggerEl, domEl, props.direction, {top: 8})
    }

    await fastRafPromise();
    if(destroyed || _tempId !== tempId || currentMenu !== menu) {
      removeMenu(menu);
      return;
    }

    props.onToggleMenu?.(true)
    contextMenuController.openBtnMenu(domEl, () => {
      ++tempId;
      props.onToggleMenu?.(false)
      opened = false
      menu.removeTimeout = window.setTimeout(() => {
        menu.removeTimeout = undefined;
        removeMenu(menu)
      }, 300);
    })
    opened = true
  }

  onCleanup(() => {
    destroyed = true
    ++tempId;
    if(opened) contextMenuController.close()
    opened = false
    if(currentMenu) removeMenu(currentMenu)
  })

  return {open, close}
}

export function ButtonMenuSelect<T>(props: Parameters<typeof createButtonMenuSelect<T>>[0] & {
  children: JSX.Element
}) {
  const children = resolveFirst(() => props.children, it => it instanceof HTMLElement)

  const {open} = createButtonMenuSelect(props)

  createEffect(on(children, (el: HTMLElement) => {
    if(!el) return
    const clean = attachClickEvent(el, (evt) => {
      if((evt.target as HTMLElement).closest('.btn-menu')) return;
      open(el)
    })
    onCleanup(clean)
  }))

  return children()
}
