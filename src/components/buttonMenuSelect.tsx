import {resolveFirst} from '@solid-primitives/refs'
import {ComponentProps, createEffect, createMemo, createRoot, createSignal, For, JSX, on, onCleanup, onMount, splitProps} from 'solid-js'
import {attachClickEvent} from '../helpers/dom/clickEvent'
import {IconTsx} from './iconTsx'
import contextMenuController from '../helpers/contextMenuController'
import {ButtonMenuDirection} from './buttonMenuToggle'
import {doubleRaf, fastRaf, fastRafPromise} from '../helpers/schedulers'
import {I18nTsx} from '../helpers/solid/i18n'
import {i18n} from '../lib/langPack'
import Scrollable from './scrollable2'
import LazyLoadQueue from './lazyLoadQueue'
import SuperStickerRenderer from './emoticonsDropdown/tabs/SuperStickerRenderer'
import rootScope from '../lib/rootScope'
import clamp from '../helpers/number/clamp'
import classNames from '../helpers/string/classNames'
import {positionMenuTrigger} from '../helpers/positionMenu'

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
  }) => JSX.Element
  optionSearchText: (option: T) => string
  optionKey: (option: T) => string
  deselectAllOnFirstSelect?: boolean
}) {
  const [search, setSearch] = createSignal('')
  const cleanForSearch = (text: string) => text.toLowerCase().replace(/[\s+/\\_-]/g, '').trim()
  const filteredOptions = createMemo(() => {
    const search$ = search();
    if(search$ === '') return props.options;
    const cleanSearch = cleanForSearch(search$);
    return props.options.filter(option => cleanForSearch(props.optionSearchText(option)).includes(cleanSearch))
  })
  const chosenKeys = createMemo(() => {
    const chosen$ = props.value;
    return new Set(chosen$.map(it => props.optionKey(it)))
  })

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
  onMount(() => doubleRaf().then(() => inputEl.focus()))

  return (
    <div class={classNames('btn-menu', 'btn-menu-select', props.class)}>
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
      <div
        class="btn-menu-search-scrollable"
        style={{height: `${Math.min(1 + filteredOptions().length, 7.5) * 32}px`}}
      >
        <Scrollable axis="y" ref={scrollable}>
          <div
            class="btn-menu-item"
            onClick={() => props.onValueChange(props.options)}
          >
            <IconTsx icon="checkround" class="btn-menu-item-icon" />
            <I18nTsx class="btn-menu-item-text" key='SelectAll2' />
          </div>
          <For each={filteredOptions()}>
            {option => (
              <div
                class="btn-menu-item"
                onClick={() => {
                  const optionKey = props.optionKey(option)
                  const wasChosen = chosenKeys().has(optionKey)

                  if(props.deselectAllOnFirstSelect && props.value.length === props.options.length) {
                    props.onValueChange([option])
                    return
                  }

                  if(wasChosen) {
                    props.onValueChange(props.value.filter(it => props.optionKey(it) !== optionKey))
                  } else {
                    props.onValueChange([...props.value, option])
                  }
                }}
              >
                {props.renderOption({
                  option,
                  get chosen() {
                    return chosenKeys().has(props.optionKey(option))
                  },
                  stickerRenderer
                })}
              </div>
            )}
          </For>
        </Scrollable>
      </div>
    </div>
  )
}

export function ButtonMenuSelect<T>(props: ComponentProps<typeof ButtonMenuSelectInner<T>> & {
  onToggleMenu: (open: boolean) => void
  direction: ButtonMenuDirection
  children: JSX.Element
}) {
  const children = resolveFirst(() => props.children, it => it instanceof HTMLElement)

  let dispose: () => void;
  let closeTimeout: number;
  let tempId = 0;

  async function open(triggerEl: HTMLElement) {
    dispose?.()
    const _tempId = ++tempId;

    if(closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = undefined;
      return;
    }

    await fastRafPromise();
    if(_tempId !== tempId) return;

    const el = createRoot((dispose_) => {
      dispose = dispose_
      const [, innerProps] = splitProps(props, ['children', 'onToggleMenu', 'direction'])

      return <ButtonMenuSelectInner {...innerProps} />
    })
    const domEl = typeof el === 'function' ? (el as () => HTMLElement)() : el as HTMLElement

    props.onToggleMenu(true)
    domEl.classList.add(props.direction)
    positionMenuTrigger(triggerEl, domEl, props.direction, {top: 8})
    document.body.append(domEl)

    await fastRafPromise();

    contextMenuController.openBtnMenu(domEl, () => {
      ++tempId;
      clearTimeout(closeTimeout);
      closeTimeout = undefined;

      props.onToggleMenu(false)
      closeTimeout = window.setTimeout(() => {
        closeTimeout = undefined;
        domEl.remove();
        dispose?.()
      }, 300);
    })
  }

  onCleanup(() => {
    dispose?.()
  })

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
