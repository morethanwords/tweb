/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, on, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {AppManagers} from '../../lib/appManagers/managers';
import {NULL_PEER_ID} from '../../lib/mtproto/mtproto_config';
import Chat from './chat';
import PinnedContainer from './pinnedContainer';
import ChatTopbar from './topbar';
import {SponsoredMessage} from '../../layer';
import classNames from '../../helpers/string/classNames';

import styles from './topbarSponsored.module.scss';
import {Ripple} from '../rippleTsx';
import {I18nTsx} from '../../helpers/solid/i18n';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import appImManager from '../../lib/appManagers/appImManager';
import {getMiddleware} from '../../helpers/middleware';
import {PhotoTsx} from '../wrappers/photo';
import {MyPhoto} from '../../lib/appManagers/appPhotosManager';
import {ButtonIconTsx} from '../buttonIconTsx';
import PopupPremium from '../popups/premium';
import createContextMenu from '../../helpers/dom/createContextMenu';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {getSponsoredMessageButtons} from './contextMenu';
import PopupReportAd from '../popups/reportAd';

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
      floating: true,
      height: 'auto'
    });

    [this.peerId, this.setPeerId] = createSignal<PeerId>(NULL_PEER_ID);
    this.dispose = render(() => this.init(), this.container);
  }

  private init() {
    const {peerId} = this;

    const [message, setMessage] = createSignal<SponsoredMessage>();

    const middleware = getMiddleware()

    createEffect(on(peerId, (peerId$) => {
      setMessage(undefined);
      this.toggle(true);
      if(peerId$ === NULL_PEER_ID || !peerId$.isUser()) return;
      if(!this.chat.isBot) return;

      this.managers.appMessagesManager.getSponsoredMessage(peerId$).then((message) => {
        if(peerId() !== peerId$) return;

        if(message._ === 'messages.sponsoredMessages' && message.messages.length) {
          setMessage(message.messages[0]);
          this.toggle(false);
        }
      });
    }))

    const photo = () => {
      const message$ = message();
      if(message$.photo) return message$.photo as MyPhoto;
      if(message$.media && message$.media._ === 'messageMediaPhoto') return message$.media.photo as MyPhoto;
      return undefined;
    }

    return (
      <Show when={message()}>
        <div
          class={/* @once */ classNames(styles.container, 'quote-like')}
          // @ts-expect-error
          on:click={() => appImManager.onSponsoredMessageClick(message())}
          ref={(el) => {
            if(!el) return;
            return createContextMenu({
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
              })
            });
          }}
        >
          {photo() && (
            <div class={/* @once */ styles.photoWrap}>
              <PhotoTsx
                class={/* @once */ styles.photo}
                photo={photo()}
                boxWidth={32}
                boxHeight={32}
                withoutPreloader
              />
            </div>
          )}
          <div class={/* @once */ styles.content}>
            <div class={/* @once */ styles.title}>
              <I18nTsx class={/* @once */ styles.ad} key="SponsoredMessageAd" />
              {' '}
              {wrapEmojiText(message().title)}
            </div>
            <div class={/* @once */ styles.text}>
              {wrapRichText(message().message, {entities: message().entities})}
            </div>
          </div>
          <div class={/* @once */ styles.actions}>
            <ButtonIconTsx
              icon="close"
              // onMouseDown={e => e.stopPropagation()}
              noRipple
              // @ts-expect-error
              on:click={(e) => {
                e.stopPropagation();
                PopupPremium.show({feature: 'no_ads'})
              }}
            />
          </div>
        </div>
      </Show>
    );
  }

  public destroy() {
    super.destroy();
    this.dispose();
  }
}
