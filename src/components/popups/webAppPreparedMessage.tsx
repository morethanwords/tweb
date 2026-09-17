import {createResource, createSignal, onMount} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {I18nTsx} from '@helpers/solid/i18n';

import {BotInlineResult, Message, MessageEntity, MessagesPreparedInlineMessage, Photo, ReplyMarkup, TextWithEntities} from '@layer';
import {BubbleLayout} from '@components/chat/bubbles/bubbleLayout';
import {FakeBubbles} from '@components/chat/bubbles/fakeBubbles';
import {PeerTitleTsx} from '@components/peerTitleTsx';

import css from '@components/popups/webAppPreparedMessage.module.scss';
import wrapPhoto from '@components/wrappers/photo';
import classNames from '@helpers/string/classNames';
import setAttachmentSize from '@helpers/setAttachmentSize';
import {MyDocument} from '@appManagers/appDocsManager';
import mediaSizes from '@helpers/mediaSizes';
import {MyPhoto} from '@appManagers/appPhotosManager';
import wrapSticker from '@components/wrappers/sticker';
import wrapVideo from '@components/wrappers/video';
import wrapDocument from '@components/wrappers/document';
import {useAppSettings} from '@stores/appSettings';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {showPickUser2Popup} from '@components/popups/pickUser';
import appImManager from '@lib/appImManager';
import generateQId from '@appManagers/utils/inlineBots/generateQId';
import rootScope from '@lib/rootScope';
import createMiddleware from '@helpers/solid/createMiddleware';

export default function showWebAppPreparedMessagePopup(options: {
  message: MessagesPreparedInlineMessage.messagesPreparedInlineMessage,
  botId: BotId,
  onFinish?: (error?: string) => void
}) {
  const {message, botId} = options;
  const [show, setShow] = createSignal(true);
  // closing without sharing reads as a decline, but the buttons answer for themselves
  let finished = false;
  const finish = (error?: string) => {
    if(finished) {
      return;
    }

    finished = true;
    options.onFinish?.(error);
  };

  const onShare = async() => {
    const availableTypes = new Set(message.peer_types.map((it) => it._));

    const chosenPeerId = await showPickUser2Popup({
      peerType: ['dialogs', 'contacts'],
      filterPeerTypeBy: (peer) => {
        if(peer._ === 'user') {
          if(peer.id === botId && availableTypes.has('inlineQueryPeerTypeSameBotPM')) return true;
          if(peer.pFlags.bot && availableTypes.has('inlineQueryPeerTypeBotPM')) return true;
          if(availableTypes.has('inlineQueryPeerTypePM')) return true;
        }
        if(peer._ === 'chat' && availableTypes.has('inlineQueryPeerTypeChat')) return true;
        if(peer._ === 'channel') {
          if(peer.pFlags.broadcast && availableTypes.has('inlineQueryPeerTypeBroadcast')) return true;
          if(peer.pFlags.megagroup && availableTypes.has('inlineQueryPeerTypeChat')) return true;
        }

        return false;
      },
      chatRightsActions: ['send_inline']
    }).catch(() => undefined as PeerId);

    if(!chosenPeerId) {
      return false;
    }

    await appImManager.setInnerPeer({peerId: chosenPeerId});
    const queryAndResultIds = generateQId(message.query_id, message.result.id);
    const sent = await rootScope.managers.appInlineBotsManager.sendInlineResult(chosenPeerId, botId, queryAndResultIds, {
      inlineResult: message.result,
      ...appImManager.chat.getMessageSendingParams(),
      clearDraft: true
    });

    if(!sent) {
      return false;
    }

    finish();
    return true;
  };

  createPopup(() => {
    const middleware = createMiddleware().get();
    const result = message.result;
    const sendMessage = result.send_message

    let text: string
    let entities: MessageEntity[]
    let attachmentDiv: HTMLDivElement
    let contentDiv: HTMLDivElement
    let bubbleClass = css.bubble;
    const bubbleContainerStyle: Record<string, string> = {};

    switch(sendMessage._) {
      case 'botInlineMessageText':
      case 'botInlineMessageMediaAuto':
      case 'botInlineMessageMediaWebPage':
        text = sendMessage.message;
        entities = sendMessage.entities;
        break;
    }

    let justMedia = false

    if(result._ === 'botInlineMediaResult' || result.thumb) {
      attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');
      if(text) {
        attachmentDiv.classList.add('no-brb');
        bubbleClass += ' with-media-tail';
      } else {
        bubbleClass += ' has-plain-media-tail';
      }
    }

    if(result._ === 'botInlineMediaResult') {
      if(result.type === 'photo' && result.photo) {
        bubbleClass += ' photo';

        wrapPhoto({
          photo: result.photo as MyPhoto,
          container: attachmentDiv,
          withTail: true,
          isOut: true,
          middleware: middleware
        })
      } else if(result.document) {
        const doc = result.document as MyDocument;

        if(result.type === 'sticker') {
          justMedia = true
          bubbleClass += ' sticker';

          if(doc.animated) {
            bubbleClass += 'sticker-animated'
          }

          const boxSize = doc.animated ? mediaSizes.active.animatedSticker : mediaSizes.active.staticSticker;

          setAttachmentSize({
            photo: doc,
            element: attachmentDiv,
            boxWidth: boxSize.width,
            boxHeight: boxSize.height
          });
          bubbleContainerStyle['min-width'] = boxSize.width + 'px';
          bubbleContainerStyle['min-height'] = boxSize.height + 'px';

          wrapSticker({
            doc,
            div: attachmentDiv,
            middleware: middleware,
            play: true,
            liteModeKey: 'stickers_chat',
            loop: true,
            withThumb: true,
            isOut: true
          })
        } else if(result.type === 'video') {
          const isRound = doc.type === 'round';
          justMedia = isRound
          bubbleClass += isRound ? ' round' : ' video';

          wrapVideo({
            doc,
            message: {
              _: 'message',
              media: {
                _: 'messageMediaDocument',
                document: doc
              }
            } as Message.message,
            container: attachmentDiv,
            middleware: middleware,
            boxWidth: mediaSizes.active.regular.width,
            boxHeight: mediaSizes.active.regular.height,
            isOut: true
          })
        } else {
          bubbleClass += ' document-message is-single-document';
          const container = document.createElement('div');
          container.classList.add('document-container');
          const wrapper = document.createElement('div');
          wrapper.classList.add('document-wrapper');

          container.append(wrapper);
          contentDiv = container

          const [appSettings] = useAppSettings();
          wrapDocument({
            message: {
              _: 'message',
              pFlags: {is_outgoing: true},
              media: {
                _: 'messageMediaDocument',
                document: doc
              }
            } as Message.message,
            middleware: middleware,
            sizeType: 'documentName',
            fontSize: appSettings.messagesTextSize,
            canTranscribeVoice: false,
            isOut: true
          }).then((div) => {
            wrapper.append(div);

            if(text) {
              const message = document.createElement('div');
              message.classList.add('document-message');
              const rich = wrapRichText(text, {entities});
              message.append(rich);
              wrapper.append(message);
            }
          });
        }
      }
    } else if(result._ === 'botInlineResult' && result.thumb && result.thumb.mime_type.indexOf('image/') === 0) {
      bubbleClass += ' photo';

      wrapPhoto({
        photo: result.thumb,
        container: attachmentDiv,
        withTail: true,
        isOut: true,
        middleware: middleware
      })
    }

    return (
      <PopupElement
        class={css.popup}
        closable
        show={show()}
        onClose={() => finish('USER_DECLINED')}
        old
      >
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="BotSharePreparedMessageTitle" />
        </PopupElement.Header>
        <PopupElement.Body>
          <FakeBubbles class={css.bubbles} contentClass={css.bubblesContent}>
            <BubbleLayout
              class={classNames(css.bubble, bubbleClass)}
              justMedia={justMedia}
              contentStyle={bubbleContainerStyle}
              text={text}
              textEntities={entities}
              out
              tail={!justMedia}
              via={botId}
              group="single"
              attachment={attachmentDiv}
              content={contentDiv}
              replyMarkup={result.send_message?.reply_markup as ReplyMarkup.replyInlineMarkup}
            />
          </FakeBubbles>

          <div class={css.text}>
            <I18nTsx
              key='BotSharePreparedMessageText'
              args={<PeerTitleTsx peerId={botId.toPeerId()} />}
            />
          </div>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton langKey="ShareFile" callback={onShare} />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
