/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createEffect, createMemo, createResource, createSignal, JSX} from 'solid-js';
import Animated from '../../helpers/solid/animations';
import createMiddleware from '../../helpers/solid/createMiddleware';
import classNames from '../../helpers/string/classNames';
import rootScope from '../../lib/rootScope';
import wrapSticker from '../wrappers/sticker';
import {fireMessageEffect} from './messageRender';

export default function SelectedEffect(props: {
  effect: Accessor<DocId>
}) {
  const [element, setElement] = createSignal<JSX.Element>();
  const lastElement = createMemo<JSX.Element>((prev) => element() || prev);
  const [availableEffects] = createResource(async() => {
    return rootScope.managers.appReactionsManager.getAvailableEffects();
  });

  createEffect(async() => {
    const effect = props.effect();
    if(!effect || !availableEffects()) {
      setElement();
      return;
    }

    const availableEffect = availableEffects().find((availableEffect) => availableEffect.id === effect);

    let ref: HTMLDivElement;
    const element = (<div class="btn-send-effect" ref={ref}></div>);

    const middlewareHelper = createMiddleware();
    const middleware = middlewareHelper.get();
    const loadPromises: Promise<any>[] = [];
    wrapSticker({
      doc: await rootScope.managers.appDocsManager.getDoc(availableEffect.static_icon_id),
      div: ref,
      middleware,
      loadPromises,
      width: 20,
      height: 20
    });

    await Promise.all(loadPromises);

    if(middleware()) {
      setElement(element);
    }

    fireMessageEffect({
      isOut: true,
      effectId: effect,
      element: ref,
      middleware
    });
  });

  return (
    <div class={classNames('btn-send-effect-container', element() && 'is-visible')}>
      <Animated type="cross-fade">
        {lastElement()}
      </Animated>
    </div>
  );
}
