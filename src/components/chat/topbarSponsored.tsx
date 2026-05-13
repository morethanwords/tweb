/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, on, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {AppManagers} from '@lib/managers';
import {NULL_PEER_ID} from '@appManagers/constants';
import Chat from '@components/chat/chat';
import PinnedContainer from '@components/chat/pinnedContainer';
import ChatTopbar from '@components/chat/topbar';
import {SponsoredMessage} from '@layer';
import classNames from '@helpers/string/classNames';

import styles from '@components/chat/topbarSponsored.module.scss';
import {I18nTsx} from '@helpers/solid/i18n';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import appImManager from '@lib/appImManager';
import PhotoTsx from '@components/wrappers/photoTsx';
import {MyPhoto} from '@appManagers/appPhotosManager';
import PopupPremium from '@components/popups/premium';
import createContextMenu from '@helpers/dom/createContextMenu';
import {copyTextToClipboard} from '@helpers/clipboard';
import {getSponsoredMessageButtons} from '@components/chat/contextMenu';
import PopupReportAd from '@components/popups/reportAd';
import createMiddleware from '@helpers/solid/createMiddleware';
import Button from '@components/buttonTsx';
import RippleElement from '@components/rippleElement';

export default class ChatTopbarSponsored extends PinnedContainer {
  private dispose: () => void;
  private peerId: () => PeerId;
  public setPeerId: (peerId: PeerId) => void;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'sponsored',
      height: 'auto'
    });

    [this.peerId, this.setPeerId] = createSignal<PeerId>(NULL_PEER_ID);
    this.dispose = render(() => this.init(), this.container);
  }

  private init() {
    const {peerId} = this;

    const [message, setMessage] = createSignal<SponsoredMessage>();

    createEffect(on(peerId, (peerId$) => {
      setMessage(undefined);
      this.toggle(true);
      if(peerId$ === NULL_PEER_ID || !peerId$.isUser()) return;
      if(!this.chat.isBot) return;

      this.managers.appMessagesManager.getSponsoredMessage(peerId$)
      .then((message) => {
        if(peerId() !== peerId$) return;

        if(message._ === 'messages.sponsoredMessages' && message.messages.length) {
          setMessage(message.messages[0]);
          this.toggle(false);
        }
      });
    }));

    const photo = () => {
      const message$ = message();
      if(message$.photo) return message$.photo as MyPhoto;
      if(message$.media && message$.media._ === 'messageMediaPhoto') return message$.media.photo as MyPhoto;
      return undefined;
    };

    const middleware = createMiddleware().get();

    return (
      <Show when={message()}>
        <RippleElement
          component="div"
          class={/* @once */ classNames(styles.container, 'quote-like-hoverable', 'overflow-hidden')}
          onClick={() => appImManager.onSponsoredMessageClick(message())}
          ref={(el) => {
            createContextMenu({
              listenTo: el,
              buttons: getSponsoredMessageButtons({
                message: message(),
                handleReportAd: () => {
                  PopupReportAd.createAdReport(message(), () => {
                    this.toggle(false);
                  });
                },
                handleCopy: () => {
                  copyTextToClipboard(message().message);
                }
              }),
              middleware
            });
          }}
        >
          <Show when={photo()}>
            <div class={/* @once */ classNames(styles.photoWrap, 'disable-hover')}>
              <PhotoTsx
                class={/* @once */ styles.photo}
                photo={photo()}
                boxWidth={32}
                boxHeight={32}
                withoutPreloader
              />
            </div>
          </Show>
          <div class={/* @once */ classNames(styles.content, 'disable-hover')}>
            <div class="text-bold">
              <I18nTsx class="primary" key="SponsoredMessageAd" />
              {' '}
              {wrapEmojiText(message().title)}
            </div>
            <div class="pre-wrap">
              {wrapRichText(message().message, {entities: message().entities})}
            </div>
          </div>
        </RippleElement>
        <Button.Icon
          icon="close"
          onClick={(e) => {
            e.stopPropagation();
            PopupPremium.show({feature: 'no_ads'});
          }}
        />
      </Show>
    );
  }

  public destroy() {
    super.destroy();
    this.dispose();
  }
}
