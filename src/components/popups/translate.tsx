/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, JSX, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';
import PopupElement from '.';
import documentFragmentToNodes from '../../helpers/dom/documentFragmentToNodes';
import classNames from '../../helpers/string/classNames';
import usePeerTranslation from '../../hooks/usePeerTranslation';
import {Message, TextWithEntities} from '../../layer';
import {i18n} from '../../lib/langPack';
import wrapRichText, {WrapRichTextOptions} from '../../lib/richTextProcessor/wrapRichText';
import {onMediaCaptionClick} from '../appMediaViewer';
import {pickLanguage} from '../chat/translation';
import {putPreloader} from '../putPreloader';
import Section from '../section';
import {TranslatableMessageTsx} from '../translatableMessage';

export default class PopupTranslate extends PopupElement {
  constructor(private options: {
    peerId: PeerId,
    message?: Message.message,
    textWithEntities?: TextWithEntities,
    detectedLanguage: TranslatableLanguageISO
  }) {
    super('popup-translate', {
      buttons: [{
        langKey: 'OK',
        isCancel: true
      }, {
        langKey: 'Telegram.LanguageViewController',
        callback: () => {
          pickLanguage(false).then((language) => {
            usePeerTranslation(this.options.peerId).setLanguage(language);
          });
          return false;
        }
      }],
      scrollable: true,
      body: true,
      overlayClosable: true
    });

    this.header.remove();

    const dispose = render(() => this.d(), this.scrollable.container);
    this.addEventListener('closeAfterTimeout', dispose);
  }

  private d() {
    onMount(() => {
      setTimeout(() => {
        this.show();
      }, 0);
    });

    let originalTextWithEntities: TextWithEntities = this.options.textWithEntities;
    if(this.options.message) {
      originalTextWithEntities = {
        _: 'textWithEntities',
        text: this.options.message.message,
        entities: this.options.message.totalEntities
      };
    }

    const richTextOptions: WrapRichTextOptions = {
      middleware: this.middlewareHelper.get(),
      textColor: 'primary-text-color'
    };

    const WrappedMessage = (props: {children: JSX.Element, limited?: boolean}) => {
      let div: HTMLDivElement;
      const ret = (
        <div
          ref={div}
          class={classNames('popup-translate-text', 'spoilers-container', props.limited && 'is-limited')}
          dir="auto"
        >
          {props.children}
        </div>
      );

      const onClick = (e: MouseEvent) => {
        const callback = div && onMediaCaptionClick(div, e);
        if(!callback) {
          return;
        }

        div.removeEventListener('click', onClick, {capture: true});
        this.hideWithCallback(callback);
      };

      div.addEventListener('click', onClick, {capture: true});
      return ret;
    };

    const wrap = (textWithEntities: TextWithEntities, limit?: number) => {
      const [limiting, setLimiting] = createSignal(!!limit && textWithEntities.text.length > limit);
      const [text, setText] = createSignal<JSX.Element>();

      createEffect(() => {
        // const _text = limiting() ? textWithEntities.text.slice(0, limit).replace(/\n/g, ' ')/*  + '...' */ : textWithEntities.text;
        const text = wrapRichText(textWithEntities.text, {
          ...richTextOptions,
          entities: textWithEntities.entities,
          noTextFormat: limiting()
          // noLinebreaks: limiting()
        });

        setText(documentFragmentToNodes(text));
      });

      return (
        <WrappedMessage limited={limiting()}>
          <Show when={limiting()} fallback={text()}>
            <span class="popup-translate-text-text">
              {text()}
            </span>
            <span
              class="popup-translate-text-more primary"
              onClick={() => {
                setLimiting(false);
                setTimeout(() => {
                  this.scrollable.onScroll();
                }, 0);
              }}
            >
              {i18n('Show')}
            </span>
          </Show>
        </WrappedMessage>
      );
    };

    const peerLanguage = usePeerTranslation(this.options.peerId);
    const preloader = putPreloader(undefined, true);

    const [loading, setLoading] = createSignal(true);
    const loadPromises: Promise<void>[] = [];
    const translatable = (
      <TranslatableMessageTsx
        peerId={this.options.peerId}
        message={this.options.message}
        textWithEntities={this.options.textWithEntities}
        richTextOptions={{...richTextOptions, loadPromises}}
        enabled
      />
    );

    Promise.all(loadPromises).then(() => {
      setLoading(false);
      setTimeout(() => {
        this.scrollable.onScroll();
      }, 0);
    });

    return (
      <>
        <Section noShadow name={`Language.${this.options.detectedLanguage}`}>
          {wrap(originalTextWithEntities, 120)}
        </Section>
        <Section noShadow name={`Language.${peerLanguage.language()}`} fakeGradientDelimiter>
          <Show when={!loading()} fallback={(
            <div class="popup-translate-preloader">
              {preloader}
            </div>
          )}>
            <WrappedMessage>{translatable}</WrappedMessage>
          </Show>
        </Section>
      </>
    );
  }
}
