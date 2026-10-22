import {Accessor, createEffect, createMemo, createResource, createSignal, JSX} from 'solid-js';
import Animated from '@helpers/solid/animations';
import createMiddleware from '@helpers/solid/createMiddleware';
import classNames from '@helpers/string/classNames';
import rootScope from '@lib/rootScope';
import wrapSticker from '@components/wrappers/sticker';
import {fireMessageEffect} from '@components/chat/messageRender';

export default function SelectedEffect(props: {
  effect: Accessor<DocId>
}) {
  const [element, setElement] = createSignal<JSX.Element>();
  const lastElement = createMemo<JSX.Element>((prev) => element() || prev);
  // * asked for once, when an effect is chosen first: the list is ~200 KB, and asked for by every new composer it came
  // * right when the first chat of a tab opened and held its history back by ~0.4 s
  const effectChosen = createMemo((chosen) => chosen || !!props.effect(), false);
  const [availableEffects] = createResource(effectChosen, async() => {
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
