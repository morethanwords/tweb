import {createSignal} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import formatDuration from '@helpers/formatDuration';
import {I18nTsx} from '@helpers/solid/i18n';
import {MyDocument} from '@appManagers/appDocsManager';
import {AvatarNewTsx} from '@components/avatarNew';
import {StickerTsx} from '@components/wrappers/sticker';
import MediaHeader from '@components/mediaHeader';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {randomItem, randomItemExcept} from '@helpers/array/randomItem';
import assumeType from '@helpers/assumeType';
import LottiePlayer from '@lib/lottie/lottiePlayer';

import css from '@components/popups/webAppEmojiStatusAccess.module.scss';
import rootScope from '@lib/rootScope';
import {PeerTitleTsx} from '@components/peerTitleTsx';

export default function showWebAppEmojiStatusAccessPopup(options: {
  botId: PeerId,
  sticker?: MyDocument,
  defaultStatusEmojis?: MyDocument[],
  period?: number,
  onFinish: (result: boolean) => void
}) {
  const {botId, sticker: givenSticker, defaultStatusEmojis, period} = options;
  // closing without answering reads as a decline, but the buttons answer for themselves
  let finished = false;
  const finish = (result: boolean) => {
    finished = true;
    options.onFinish(result);
  };

  createPopup(() => {
    const [sticker, setSticker] = createSignal<MyDocument>(givenSticker ?? randomItem(defaultStatusEmojis));

    let stickerRef: HTMLElement;
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
            if(givenSticker) return;
            stickerRef.classList.remove(css.switch);

            assumeType<LottiePlayer>(player);
            player.playOrRestart();
            player.addEventListener('enterFrame', (frameNo) => {
              if(frameNo === player.maxFrame) {
                player.stop(false);
                stickerRef.classList.add(css.switch);
                stickerRef.addEventListener('transitionend', () => {
                  setSticker(randomItemExcept(defaultStatusEmojis, sticker()));
                }, {once: true});
              }
            });
          }}
        />
      </div>
    );

    const renderText = () => (
      <I18nTsx
        key={
          givenSticker ?
            period ?
              'BotSetEmojiStatusTextFor' :
              'BotSetEmojiStatusText' :
            'BotSetEmojiStatusOffline'
        }
        args={givenSticker && period ? [
          <PeerTitleTsx peerId={botId} />,
          wrapFormattedDuration(formatDuration(period))
        ] : [
          <PeerTitleTsx peerId={botId} />,
          !givenSticker && <PeerTitleTsx peerId={botId} />
        ]}
      />
    );

    return (
      <PopupElement
        class={css.popup}
        closable
        onClose={() => !finished && options.onFinish(false)}
        old
      >
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body class={!givenSticker ? css.forOffline : undefined}>
          {givenSticker ? (
            <>
              <MediaHeader marginTop>
                <MediaHeader.Sticker
                  size={96}
                  element={(
                    <StickerTsx
                      autoStyle
                      sticker={givenSticker}
                      extraOptions={{play: true}}
                      width={96}
                      height={96}
                    />
                  )}
                />
                <MediaHeader.Title size={20}>
                  <I18nTsx key="BotSetEmojiStatusTitle" />
                </MediaHeader.Title>
                <MediaHeader.Subtitle>{renderText()}</MediaHeader.Subtitle>
              </MediaHeader>
              {renderChip()}
            </>
          ) : (
            <>
              {renderChip()}
              <MediaHeader.Subtitle class={/* @once */ css.text}>{renderText()}</MediaHeader.Subtitle>
            </>
          )}
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            langKey={givenSticker ? 'Confirm' : 'Allow'}
            callback={() => finish(true)}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
