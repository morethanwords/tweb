import {Accessor, createEffect, createSignal, on, Show} from 'solid-js';
import {AppManagers} from '@lib/managers';
import {NULL_PEER_ID} from '@appManagers/constants';
import Chat from '@components/chat/chat';
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
import {showAdReport} from '@components/popups/reportAd';
import createMiddleware from '@helpers/solid/createMiddleware';
import Button from '@components/buttonTsx';
import RippleElement from '@components/rippleElement';
import {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

export type ChatSponsoredPlate = TopbarPlateController & {
  setPeerId: (peerId: PeerId) => void
};

function SponsoredPlateBody(props: {
  peerId: Accessor<PeerId>,
  chat: Chat,
  managers: AppManagers,
  setHidden: (hidden: boolean) => void
}) {
  const [message, setMessage] = createSignal<SponsoredMessage>();

  createEffect(on(props.peerId, (peerId$) => {
    setMessage(undefined);
    props.setHidden(true);
    if(peerId$ === NULL_PEER_ID || !peerId$.isUser()) return;
    if(!props.chat.isBot) return;

    props.managers.appMessagesManager.getSponsoredMessage(peerId$)
    .then((m) => {
      if(props.peerId() !== peerId$) return;

      if(m._ === 'messages.sponsoredMessages' && m.messages.length) {
        setMessage(m.messages[0]);
        props.setHidden(false);
      }
    });
  }));

  const photo = () => {
    const m = message();
    if(m.photo) return m.photo as MyPhoto;
    if(m.media && m.media._ === 'messageMediaPhoto') return m.media.photo as MyPhoto;
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
                showAdReport(message(), () => props.setHidden(false));
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

export default function createChatSponsoredPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatSponsoredPlate {
  const [peerId, setPeerIdSignal] = createSignal<PeerId>(NULL_PEER_ID);

  const plate = createTopbarPlate({
    modifier: 'sponsored',
    height: 'auto',
    onVisibilityChange: () => topbar.setFloating(),
    render: ({setHidden}) => (
      <SponsoredPlateBody
        peerId={peerId}
        chat={chat}
        managers={managers}
        setHidden={setHidden}
      />
    )
  });

  return {
    ...plate,
    setPeerId: (next) => setPeerIdSignal(next)
  };
}
