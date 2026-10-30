/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, getOwner, JSX, onCleanup, runWithOwner} from 'solid-js';
import {insert} from 'solid-js/web';
import AppSelectPeers from '@components/appSelectPeers';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {getMiddleware} from '@helpers/middleware';
import rootScope from '@lib/rootScope';
import {useWallet} from '@components/wallet/context';
import styles from '@components/wallet/wallet.module.scss';

export type WalletPickerOptions = Omit<
  ConstructorParameters<typeof AppSelectPeers>[0],
  'appendTo' | 'managers' | 'middleware' | 'multiSelect' | 'onFirstRender' | 'noInstantLoad'
>;

/**
 * Puts `query` into the picker's search as if it was typed: the list and `onSearch` follow it
 */
export function setWalletPickerQuery(selector: AppSelectPeers, query: string) {
  const inputSearch = selector.inputSearch;
  if(!inputSearch) return;
  inputSearch.value = query;
  // * the field's own setter is silent: the search runs once it is told
  inputSearch.onChange?.(query);
  if(!IS_TOUCH_SUPPORTED) inputSearch.input.focus({preventScroll: true});
}

/**
 * The app's picker — the search field and the list `showPickUserPopup` shows (AppSelectPeers) — as a screen of the
 * wallet under the screen's own header, so it slides in with the other screens instead of opening a popup of its
 * own. One pick at a time: `onSelect` takes it. The screen comes in with its list drawn.
 */
export default function WalletPicker(props: {
  /** what the selector is made with; a promise holds the screen until it is known */
  options: WalletPickerOptions | Promise<WalletPickerOptions>,
  /** the selector, once made: a list of something else than peers draws its own rows into it */
  ref?: (selector: AppSelectPeers) => void,
  /** the search text, as it changes */
  onSearch?: (query: string) => void,
  /** what goes above the list */
  aboveList?: JSX.Element,
  /** the list (and its "no results") is away while what is above it is all there is */
  listHidden?: Accessor<boolean>
}) {
  const wallet = useWallet();
  const middlewareHelper = getMiddleware();
  let selector: AppSelectPeers;
  let firstRender: () => void;
  wallet.router.holdEntrance(new Promise<void>((resolve) => firstRender = resolve));

  const container = document.createElement('div');
  container.classList.add(styles.picker, 'selector-picker');

  const owner = getOwner();
  Promise.resolve(props.options).then((options) => runWithOwner(owner, () => {
    const middleware = middlewareHelper.get();
    if(!middleware()) return;
    selector = new AppSelectPeers({
      avatarSize: 'abitbigger',
      noPlaceholder: true,
      rippleEnabled: false,
      ...options,
      appendTo: container,
      managers: rootScope.managers,
      middleware,
      multiSelect: 'disabled',
      noInstantLoad: true,
      onFirstRender: () => {
        firstRender();
        selector.checkForTriggers();
        // * the field takes the typing at once, as the picker's does; the screen is still sliding in
        if(!IS_TOUCH_SUPPORTED) selector.inputSearch?.input.focus({preventScroll: true});
      }
    });
    props.ref?.(selector);

    selector.onSearchChange = (query) => props.onSearch?.(query);
    if(props.aboveList) {
      const mount = document.createElement('div');
      insert(mount, () => props.aboveList);
      selector.heightContainer.before(mount);
    }

    createEffect(() => selector.heightContainer.classList.toggle('hide', !!props.listHidden?.()));
    selector.loadFirst();
  }), firstRender);

  onCleanup(() => {
    selector?.destroy();
    middlewareHelper.destroy();
  });

  return container;
}
