/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '../helpers/cancellablePromise';
import {Middleware} from '../helpers/middleware';
import {modifyAckedPromise} from '../helpers/modifyAckedResult';
import usePeerTranslation from '../hooks/usePeerTranslation';
import {Message, TextWithEntities} from '../layer';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import {createRoot, createSignal, createMemo, onCleanup, createEffect} from 'solid-js';
import {createMiddleware} from './stories/viewer';
import rootScope from '../lib/rootScope';
import SuperIntersectionObserver from '../helpers/dom/superIntersectionObserver';
import {processMessageForTranslation} from '../stores/peerLanguage';

function _TranslatableMessage(props: {
  peerId: PeerId,
  message?: Message.message,
  richTextOptions?: Parameters<typeof wrapRichText>[1],
  observer?: SuperIntersectionObserver,
  observeElement?: HTMLElement,
  container?: HTMLElement,
  onTranslation?: (callback: () => void) => void
}) {
  const [visible, setVisible] = createSignal(false);
  const wasVisible = createMemo<boolean>((prev) => prev || visible());
  const [textWithEntities, setTextWithEntities] = createSignal<TextWithEntities>();
  const translation = usePeerTranslation(props.peerId);
  const deferred = deferredPromise<void>();
  const originalText: TextWithEntities = {
    _: 'textWithEntities',
    text: props.message.message,
    entities: props.message.totalEntities
  };
  let first = true, hadText = false;

  processMessageForTranslation(props.peerId, props.message.mid);

  if(props.richTextOptions?.loadPromises) {
    props.richTextOptions.loadPromises.push(deferred);
  }

  const translate = (lang: string, onlyCache?: boolean) => {
    return modifyAckedPromise(rootScope.managers.acknowledged.appTranslationsManager.translateText({
      peerId: props.message.peerId,
      mid: props.message.mid,
      lang,
      onlyCache
    }));
  };

  const setOriginalText = () => setTextWithEntities(originalText);

  if(props.observer && props.observeElement) {
    const onVisible = (entry: IntersectionObserverEntry) => {
      setVisible(entry.isIntersecting);
    };

    props.observer.observe(props.observeElement, onVisible);
    onCleanup(() => {
      props.observer.unobserve(props.observeElement, onVisible);
    });
  }

  createEffect(async() => {
    const middleware = createMiddleware().get();
    const lang = translation.language();
    const _first = first;
    first = false;

    // if the message is invisible and it's not the first time we're opening the chat
    if(!lang || (!wasVisible() && !_first)) {
      setOriginalText();
      return;
    }

    const r = await translate(lang, _first);
    if(!middleware()) {
      return;
    }

    if(r.cached && !r.result) {
      setOriginalText();
      return;
    }

    const textWithEntities = await r.result;
    if(!middleware()) {
      return;
    }

    if(!textWithEntities) {
      setOriginalText();
      return;
    }

    setTextWithEntities(textWithEntities);
  });

  createEffect(() => {
    const r = textWithEntities();
    if(!r) {
      return;
    }

    const middleware = createMiddleware().get();
    const loadPromises: Promise<any>[] = [];
    const wrapped = wrapRichText(r.text, {
      ...(props.richTextOptions || {}),
      loadPromises,
      entities: r.entities
    });

    Promise.all(loadPromises).then(() => {
      if(!middleware()) return;

      const set = () => {
        if(!middleware()) return;
        deferred.resolve();
        // setInnerHTML(props.container, wrapped);
        props.container.replaceChildren(wrapped);
        hadText = true;
      };

      if(hadText && props.onTranslation) {
        props.onTranslation(set);
        return;
      }

      set();
    });
  });
}

export default function TranslatableMessage(props: Parameters<typeof _TranslatableMessage>[0] & {middleware: Middleware}) {
  const container = props.container ??= document.createElement('span');
  container.classList.add('translatable-message');

  createRoot((dispose) => {
    props.middleware.onDestroy(dispose);
    return _TranslatableMessage(props);
  });

  return container;
}
