/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import PopupElement from '.';
import {LangPackKey, i18n} from '../../lib/langPack';
import wrapPeerTitle from '../wrappers/peerTitle';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {DelimiterWithText} from '../chat/giveaway';
import PopupPremium from './premium';
import wrapLocalSticker from '../wrappers/localSticker';
import liteMode from '../../helpers/liteMode';
import {toastNew} from '../toast';
import toggleDisability from '../../helpers/dom/toggleDisability';

export default class PopupToggleReadDate extends PopupElement {
  private titles: HTMLElement[];
  private isPremiumPurchaseBlocked: boolean;
  private stickerContainer: HTMLElement;

  constructor(
    private peerId: PeerId,
    private type: 'lastSeen' | 'readTime'
  ) {
    super('popup-toggle-read-date', {
      closable: true,
      overlayClosable: true,
      body: true
    });

    this.construct();
  }

  private _construct() {
    const Part = (props: {
      title: JSX.Element,
      text: JSX.Element,
      buttonText: LangPackKey,
      onClick: () => any,
      isPremium?: boolean
    }) => {
      let button: HTMLButtonElement;
      return (
        <>
          <div class="popup-toggle-read-date-title">{props.title}</div>
          <div class="popup-toggle-read-date-subtitle">{props.text}</div>
          <button
            ref={button}
            class={'btn-primary btn-color-primary popup-toggle-read-date-button' + (props.isPremium ? ' popup-gift-premium-confirm shimmer' : '')}
            onClick={() => {
              const result = props.onClick();
              if(result instanceof Promise) {
                toggleDisability(button, true);
              }
            }}
          >
            {i18n(props.buttonText)}
          </button>
        </>
      );
    };

    const map: {[type in PopupToggleReadDate['type']]?: {
      title1: LangPackKey,
      text1: LangPackKey,
      lockedText: LangPackKey,
      buttonText1: LangPackKey,
      onClick: () => void,
      title2: LangPackKey,
      text2: LangPackKey,
      buttonText2: LangPackKey
    }} = {
      lastSeen: {
        title1: 'PremiumLastSeenHeader1',
        text1: 'PremiumLastSeenText1',
        lockedText: 'PremiumLastSeenText1Locked',
        buttonText1: 'PremiumLastSeenButton1',
        onClick: async() => {
          await this.managers.appPrivacyManager.setPrivacy(
            'inputPrivacyKeyStatusTimestamp',
            [{_: 'inputPrivacyValueAllowAll'}]
          );
          this.hide();
          toastNew({langPackKey: 'PremiumLastSeenSet'});
        },
        title2: 'PremiumLastSeenHeader2',
        text2: 'PremiumLastSeenText2',
        buttonText2: 'PremiumLastSeenButton2'
      },
      readTime: {
        title1: 'PremiumReadHeader1',
        text1: 'PremiumReadText1',
        lockedText: 'PremiumReadText1Locked',
        buttonText1: 'PremiumReadButton1',
        onClick: async() => {
          const globalPrivacy = await this.managers.appPrivacyManager.getGlobalPrivacySettings();
          await this.managers.appPrivacyManager.setGlobalPrivacySettings({
            _: 'globalPrivacySettings',
            pFlags: {
              ...globalPrivacy.pFlags,
              hide_read_marks: undefined
            }
          });
          this.hide();
          toastNew({langPackKey: 'PremiumReadSet'});
        },
        title2: 'PremiumReadHeader2',
        text2: 'PremiumReadText2',
        buttonText2: 'PremiumReadButton2'
      }
    };

    const details = map[this.type];

    return (
      <>
        <div class="popup-toggle-read-date-sticker">
          {this.stickerContainer}
        </div>
        <Part
          title={i18n(details.title1)}
          text={i18n(this.isPremiumPurchaseBlocked ? details.lockedText : details.text1, [this.titles[0]])}
          buttonText={details.buttonText1}
          onClick={details.onClick}
        />
        {!this.isPremiumPurchaseBlocked && (
          <>
            <DelimiterWithText langKey="PremiumOr" />
            <Part
              title={i18n(details.title2)}
              text={i18n(details.text2, [this.titles[1]])}
              buttonText={details.buttonText2}
              onClick={() => {
                this.hide();
                PopupPremium.show();
              }}
              isPremium
            />
          </>
        )}
      </>
    );
  }

  private async construct() {
    const [titles, isPremiumPurchaseBlocked, stickerContainer] = await Promise.all([
      Promise.all(new Array(2).fill(0).map(() => wrapPeerTitle({peerId: this.peerId, onlyFirstName: true}))),
      apiManagerProxy.isPremiumPurchaseBlocked(),
      wrapLocalSticker({
        width: 86,
        height: 86,
        assetName: this.type === 'lastSeen' ? 'large_lastseen' : 'large_readtime',
        middleware: this.middlewareHelper.get(),
        loop: false,
        autoplay: liteMode.isAvailable('stickers_chat')
      }).then(async({container, promise}) => {
        await promise;
        return container
      })
    ]);
    this.titles = titles;
    this.isPremiumPurchaseBlocked = isPremiumPurchaseBlocked;
    this.stickerContainer = stickerContainer;

    this.appendSolid(() => this._construct());
    this.show();
  }
}
