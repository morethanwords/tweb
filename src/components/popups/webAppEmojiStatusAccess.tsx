import {createSignal, onCleanup} from 'solid-js';
import PopupElement from '.';
import formatDuration from '../../helpers/formatDuration';
import safeAssign from '../../helpers/object/safeAssign';
import {I18nTsx} from '../../helpers/solid/i18n';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {AvatarNewTsx} from '../avatarNew';
import {StickerTsx} from '../wrappers/sticker';
import {wrapFormattedDuration} from '../wrappers/wrapDuration';
import {randomItem, randomItemExcept} from '../../helpers/array/randomItem';
import assumeType from '../../helpers/assumeType';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';

import css from './webAppEmojiStatusAccess.module.scss';
import rootScope from '../../lib/rootScope';
import {PeerTitleTsx} from '../peerTitleTsx';

export default class PopupWebAppEmojiStatusAccess extends PopupElement<{
  finish: (result: boolean) => void
}> {
  private sticker: MyDocument;
  private defaultStatusEmojis: MyDocument[];
  private period: number;
  private botId: PeerId;

  constructor(options: {
    botId: PeerId,
    sticker?: MyDocument,
    defaultStatusEmojis?: MyDocument[],
    period?: number
  }) {
    let finished = false;
    super(css.popup, {
      overlayClosable: true,
      body: true,
      buttons: [
        {
          langKey: options.sticker ? 'Confirm' : 'Allow',
          callback: () => {
            finished = true
            this.dispatchEvent('finish', true);
          }
        },
        {
          langKey: options.sticker ? 'Cancel' : 'Decline',
          callback: () => {
            finished = true
            this.dispatchEvent('finish', false);
          }
        }
      ]
    });

    this.addEventListener('close', () => {
      if(!finished) {
        this.dispatchEvent('finish', false);
      }
    });

    safeAssign(this, options);

    this.header.remove()

    this.appendSolidBody(() => this._construct());
  }

  protected _construct() {
    const [sticker, setSticker] = createSignal<MyDocument>(this.sticker);

    if(!this.sticker) {
      setSticker(randomItem(this.defaultStatusEmojis));
      this.body.classList.add(css.forOffline)
    }

    const renderChip = () => (
      <div class={/* @once */ css.chip}>
        <AvatarNewTsx peerId={rootScope.myId} size={32} />
        <PeerTitleTsx peerId={rootScope.myId} />

        <StickerTsx
          ref={stickerRef}
          class={/* @once */ css.chipSticker}
          autoStyle
          sticker={sticker()}
          extraOptions={{
            play: true,
            textColor: 'primary-color'
          }}
          width={20}
          height={20}
          onRender={(player) => {
            if(this.sticker) return
            stickerRef.classList.remove(css.switch);

            assumeType<RLottiePlayer>(player);
            player.playOrRestart();
            player.addEventListener('enterFrame', (frameNo) => {
              if(frameNo === player.maxFrame) {
                player.stop(false);
                stickerRef.classList.add(css.switch)
                stickerRef.addEventListener('transitionend', () => {
                  setSticker(randomItemExcept(this.defaultStatusEmojis, sticker()));
                }, {once: true});
              }
            });
          }}
        />
      </div>
    )

    let stickerRef: HTMLElement;
    return (
      <>
        {this.sticker && (
          <>
            <StickerTsx
              autoStyle
              class={/* @once */ css.sticker}
              sticker={this.sticker}
              extraOptions={{play: true}}
              width={96}
              height={96}
            />
            <div class={/* @once */ css.title}>
              <I18nTsx key="BotSetEmojiStatusTitle" />
            </div>
          </>
        )}

        {!this.sticker && renderChip()}

        <div class={/* @once */ css.text}>
          <I18nTsx
            key={
              this.sticker ?
                this.period ?
                  'BotSetEmojiStatusTextFor' :
                  'BotSetEmojiStatusText' :
                'BotSetEmojiStatusOffline'
            }
            args={this.sticker && this.period ? [
              <PeerTitleTsx peerId={this.botId} />,
              wrapFormattedDuration(formatDuration(this.period))
            ] : [
              <PeerTitleTsx peerId={this.botId} />,
              !this.sticker && <PeerTitleTsx peerId={this.botId} />
            ]}
          />
        </div>

        {this.sticker && renderChip()}
      </>
    )
  }
}
