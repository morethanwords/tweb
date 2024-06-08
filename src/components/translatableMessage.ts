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
import rootScope from '../lib/rootScope';
import SuperIntersectionObserver from '../helpers/dom/superIntersectionObserver';
import {processMessageForTranslation} from '../stores/peerLanguage';
import createMiddleware from '../helpers/solid/createMiddleware';
import wrapMessageEntities from '../lib/richTextProcessor/wrapMessageEntities';
import wrapTextWithEntities from '../lib/richTextProcessor/wrapTextWithEntities';

const USE_OBSERVER = false;

export function TranslatableMessageTsx(props: {
  peerId: PeerId,
  message?: Message.message,
  textWithEntities?: TextWithEntities,
  richTextOptions?: Parameters<typeof wrapRichText>[1],
  observer?: SuperIntersectionObserver,
  observeElement?: HTMLElement,
  container?: HTMLElement,
  enabled?: boolean,
  onTranslation?: (callback: () => void) => void,
  onTextWithEntities?: (textWithEntities: TextWithEntities) => TextWithEntities
}) {
  const useObserver = USE_OBSERVER && props.observer && props.enabled === undefined;
  const [visible, setVisible] = createSignal(!useObserver);
  const wasVisible = createMemo<boolean>((prev) => prev || visible());
  const [textWithEntities, setTextWithEntities] = createSignal<TextWithEntities>();
  const translation = usePeerTranslation(props.peerId);
  const deferred = deferredPromise<void>();
  let originalText: TextWithEntities = props.textWithEntities;
  let first = true, hadText = false;

  const dontShowOriginalFirst = props.enabled;
  const container = props.container ?? document.createElement('span');
  container.classList.add('translatable-message');

  if(props.message) {
    processMessageForTranslation(props.peerId, props.message.mid);
    originalText = {
      _: 'textWithEntities',
      text: props.message.message,
      entities: props.message.totalEntities
    };
  }

  if(props.richTextOptions?.loadPromises) {
    props.richTextOptions.loadPromises.push(deferred);
  }

  const translate = (lang: string, onlyCache?: boolean) => {
    return modifyAckedPromise(rootScope.managers.acknowledged.appTranslationsManager.translateText({
      ...(props.message ? {
        peerId: props.message.peerId,
        mid: props.message.mid
      } : {
        text: props.textWithEntities
      }),
      lang,
      onlyCache
    }));
  };

  const setOriginalText = (loading?: boolean) => {
    setTextWithEntities(originalText);
    container.classList.toggle('text-loading', !!loading);
  };

  if(props.observer && props.observeElement && useObserver) {
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
    const _first = first;
    first = false;

    // if the message is invisible and it's not the first time we're opening the chat
    if((!translation.enabled() && !props.enabled) || (!wasVisible() && !_first)) {
      setOriginalText();
      return;
    }

    const r = await translate(translation.language(), _first && useObserver);
    if(!middleware()) {
      return;
    }

    if(!r.cached) {
      if(!dontShowOriginalFirst) {
        setOriginalText(true);
      } else {
        container.classList.add('text-loading');
      }
    } else if(!r.result) {
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
    let r = textWithEntities();
    if(!r) {
      return;
    }

    if(props.onTextWithEntities) {
      r = props.onTextWithEntities(r);
    }

    if(originalText !== r || !props.message) {
      r = wrapTextWithEntities(r);
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
        container.replaceChildren(wrapped);
        if(hadText || dontShowOriginalFirst) container.classList.remove('text-loading');
        hadText = true;
      };

      if(hadText && props.onTranslation) {
        props.onTranslation(set);
        return;
      }

      set();
    });
  });

  return container;
}

export default function TranslatableMessage(props: Parameters<typeof TranslatableMessageTsx>[0] & {middleware: Middleware}) {
  return createRoot((dispose) => {
    props.middleware.onDestroy(dispose);
    return TranslatableMessageTsx(props);
  });
}
