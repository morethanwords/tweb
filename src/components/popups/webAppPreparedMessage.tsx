import {createResource, createSignal, onMount} from 'solid-js';
import PopupElement from '.';
import safeAssign from '../../helpers/object/safeAssign';
import {I18nTsx} from '../../helpers/solid/i18n';

import {BotInlineResult, Message, MessageEntity, MessagesPreparedInlineMessage, Photo, ReplyMarkup, TextWithEntities} from '../../layer';
import {BubbleLayout} from '../chat/bubbles/bubbleLayout';
import {FakeBubbles} from '../chat/bubbles/fakeBubbles';
import {PeerTitleTsx} from '../peerTitleTsx';

import css from './webAppPreparedMessage.module.scss';
import wrapPhoto from '../wrappers/photo';
import classNames from '../../helpers/string/classNames';
import setAttachmentSize from '../../helpers/setAttachmentSize';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import mediaSizes from '../../helpers/mediaSizes';
import {MyPhoto} from '../../lib/appManagers/appPhotosManager';
import wrapSticker from '../wrappers/sticker';
import wrapVideo from '../wrappers/video';
import wrapDocument from '../wrappers/document';
import rootScope from '../../lib/rootScope';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import PopupPickUser from './pickUser';
import appImManager from '../../lib/appManagers/appImManager';
import generateQId from '../../lib/appManagers/utils/inlineBots/generateQId';

export default class PopupWebAppPreparedMessage extends PopupElement<{
  finish: (error?: string) => void
}> {
  private message: MessagesPreparedInlineMessage.messagesPreparedInlineMessage;
  private botId: BotId;

  constructor(options: {
    message: MessagesPreparedInlineMessage.messagesPreparedInlineMessage
    botId: BotId
  }) {
    let finished = false;
    super(css.popup, {
      closable: true,
      overlayClosable: true,
      body: true,
      title: 'BotSharePreparedMessageTitle',
      buttons: [
        {
          langKey: 'ShareFile',
          callback: async() => {
            const availableTypes = new Set(this.message.peer_types.map(it => it._))

            const chosenPeerId = await PopupPickUser.createPicker2({
              peerType: ['dialogs', 'contacts'],
              filterPeerTypeBy: (peer) => {
                if(peer._ === 'user') {
                  if(peer.id === this.botId && availableTypes.has('inlineQueryPeerTypeSameBotPM')) return true
                  if(peer.pFlags.bot && availableTypes.has('inlineQueryPeerTypeBotPM')) return true
                  if(availableTypes.has('inlineQueryPeerTypePM')) return true
                }
                if(peer._ === 'chat' && availableTypes.has('inlineQueryPeerTypeChat')) return true
                if(peer._ === 'channel') {
                  if(peer.pFlags.broadcast && availableTypes.has('inlineQueryPeerTypeBroadcast')) return true
                  if(peer.pFlags.megagroup && availableTypes.has('inlineQueryPeerTypeChat')) return true
                }

                return false
              },
              chatRightsActions: ['send_inline']
            }).catch(() => undefined as PeerId);

            if(!chosenPeerId) {
              return false;
            }

            await appImManager.setInnerPeer({peerId: chosenPeerId});
            const queryAndResultIds = generateQId(this.message.query_id, this.message.result.id);
            await this.managers.appInlineBotsManager.sendInlineResult(chosenPeerId, this.botId, queryAndResultIds, {
              inlineResult: this.message.result,
              ...appImManager.chat.getMessageSendingParams(),
              clearDraft: true
            })

            finished = true
            this.dispatchEvent('finish');
            return true
          }
        },
        {
          langKey: 'Cancel',
          callback: () => {
            finished = true
            this.dispatchEvent('finish', 'USER_DECLINED');
          }
        }
      ]
    });

    this.addEventListener('close', () => {
      if(!finished) {
        this.dispatchEvent('finish', 'USER_DECLINED');
      }
    });

    safeAssign(this, options);

    this.appendSolidBody(() => this._construct());
  }

  protected _construct() {
    const result = this.message.result;
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
          middleware: this.middlewareHelper.get()
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
            middleware: this.middlewareHelper.get(),
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
            middleware: this.middlewareHelper.get(),
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

          wrapDocument({
            message: {
              _: 'message',
              pFlags: {is_outgoing: true},
              media: {
                _: 'messageMediaDocument',
                document: doc
              }
            } as Message.message,
            sizeType: 'documentName',
            fontSize: rootScope.settings.messagesTextSize,
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
        middleware: this.middlewareHelper.get()
      })
    }

    return (
      <>
        <FakeBubbles class={css.bubbles} contentClass={css.bubblesContent}>
          <BubbleLayout
            class={classNames(css.bubble, bubbleClass)}
            justMedia={justMedia}
            contentStyle={bubbleContainerStyle}
            text={text}
            textEntities={entities}
            out
            tail={!justMedia}
            via={this.botId}
            group="single"
            attachment={attachmentDiv}
            content={contentDiv}
            replyMarkup={result.send_message?.reply_markup as ReplyMarkup.replyInlineMarkup}
          />
        </FakeBubbles>

        <div class={css.text}>
          <I18nTsx
            key='BotSharePreparedMessageText'
            args={<PeerTitleTsx peerId={this.botId.toPeerId()} />}
          />
        </div>
      </>
    )
  }
}
