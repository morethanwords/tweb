/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager, {AppDialogsManager} from '@lib/appDialogsManager';
import {LangPackKey} from '@lib/langPack';
import Section from '@components/section';
import {createRoot, createSignal, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {Middleware} from '@helpers/middleware';
import Scrollable from '@components/scrollable2';

export type SearchGroupType = 'contacts' | 'globalContacts' | 'messages' | string;

export type SearchGroup = ReturnType<typeof createSearchGroup>;

export function createSearchGroup(options: {
  name?: LangPackKey | boolean,
  type: string,
  clearable?: boolean,
  className?: string,
  clickable?: boolean,
  autonomous?: boolean,
  onFound?: Parameters<AppDialogsManager['setListClickListener']>[0]['onFound'],
  noIcons?: boolean,
  middleware?: Middleware,
  scrollableX?: boolean
}) {
  const {
    name,
    type,
    clearable = true,
    className,
    clickable = true,
    autonomous = true,
    onFound,
    noIcons,
    middleware,
    scrollableX
  } = options;

  const [hide, setHide] = createSignal(true);
  const list = appDialogsManager.createChatList();
  let container: HTMLDivElement;
  let nameEl: HTMLDivElement;
  let placeholder: HTMLElement;

  createRoot((dispose) => {
    <Section
      name={name}
      nameRef={(ref) => nameEl = ref}
      class={classNames(
        'search-group',
        'search-group-' + type,
        className,
        hide() && 'hide'
      )}
      ref={(ref) => container = ref}
    >
      <Show when={scrollableX} fallback={list}>
        <Scrollable
          class="search-group-scrollable-x"
          axis="x"
        >
          {list}
        </Scrollable>
      </Show>
    </Section>;

    middleware?.onClean(dispose);
  });

  if(clickable) {
    appDialogsManager.setListClickListener({
      list,
      onFound,
      withContext: undefined,
      autonomous
    });
  }

  const group = {
    container,
    list,
    nameEl,
    autonomous,
    noIcons,
    createPlaceholder: undefined as () => HTMLElement,
    get placeholder() {
      return placeholder;
    },
    addPlaceholder(el: HTMLElement) {
      group.removePlaceholder();
      placeholder = el;
      container.append(el);
    },
    removePlaceholder() {
      placeholder?.remove();
      placeholder = undefined;
    },
    clear() {
      setHide(true);
      group.removePlaceholder();
      if(clearable) {
        Array.from(list.children).forEach((el) => {
          const dialogElement = (el as any).dialogElement;
          if(dialogElement) dialogElement?.remove();
          else el.remove();
        });
      }
    },
    setActive() {
      setHide(false);
    },
    toggle() {
      if(list.childElementCount) {
        group.setActive();
      } else {
        group.clear();
      }
    }
  };

  return group;
}
