import {JSX, createSignal} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {LangPackKey, i18n} from '@lib/langPack';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import apiManagerProxy from '@lib/apiManagerProxy';
import {DelimiterWithText} from '@components/chat/giveaway';
import showPremiumPopup from '@components/popups/premium';
import wrapLocalSticker from '@components/wrappers/localSticker';
import liteMode from '@helpers/liteMode';
import {toastNew} from '@components/toast';
import toggleDisability from '@helpers/dom/toggleDisability';
import rootScope from '@lib/rootScope';
import {getMiddleware} from '@helpers/middleware';
import MediaHeader from '@components/mediaHeader';

export default async function showToggleReadDatePopup(peerId: PeerId, type: 'lastSeen' | 'readTime') {
  const managers = rootScope.managers;
  const middlewareHelper = getMiddleware();

  const [titles, isPremiumPurchaseBlocked, stickerContainer] = await Promise.all([
    Promise.all(new Array(2).fill(0).map(() => wrapPeerTitle({peerId, onlyFirstName: true}))),
    apiManagerProxy.isPremiumPurchaseBlocked(),
    wrapLocalSticker({
      width: 86,
      height: 86,
      assetName: type === 'lastSeen' ? 'large_lastseen' : 'large_readtime',
      middleware: middlewareHelper.get(),
      loop: false,
      autoplay: liteMode.isAvailable('stickers_chat')
    }).then(async({container, promise}) => {
      await promise;
      return container;
    })
  ]);

  const [show, setShow] = createSignal(true);

  const map: {[key in typeof type]: {
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
        await managers.appPrivacyManager.setPrivacy(
          'inputPrivacyKeyStatusTimestamp',
          [{_: 'inputPrivacyValueAllowAll'}]
        );
        setShow(false);
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
        const globalPrivacy = await managers.appPrivacyManager.getGlobalPrivacySettings();
        await managers.appPrivacyManager.setGlobalPrivacySettings({
          _: 'globalPrivacySettings',
          pFlags: {
            ...globalPrivacy.pFlags,
            hide_read_marks: undefined
          }
        });
        setShow(false);
        toastNew({langPackKey: 'PremiumReadSet'});
      },
      title2: 'PremiumReadHeader2',
      text2: 'PremiumReadText2',
      buttonText2: 'PremiumReadButton2'
    }
  };

  const details = map[type];

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
        <MediaHeader>
          <MediaHeader.Title size={20}>{props.title}</MediaHeader.Title>
          <MediaHeader.Subtitle>{props.text}</MediaHeader.Subtitle>
        </MediaHeader>
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

  createPopup(() => (
    <PopupElement
      class="popup-toggle-read-date"
      closable
      show={show()}
      onCloseAfterTimeout={() => middlewareHelper.destroy()}
      old
    >
      <PopupElement.Header floating>
        <PopupElement.CloseButton />
      </PopupElement.Header>
      <PopupElement.Body>
        <MediaHeader.Sticker
          class="popup-toggle-read-date-sticker"
          size={86}
          element={stickerContainer}
        />
        <Part
          title={i18n(details.title1)}
          text={i18n(isPremiumPurchaseBlocked ? details.lockedText : details.text1, [titles[0]])}
          buttonText={details.buttonText1}
          onClick={details.onClick}
        />
        {!isPremiumPurchaseBlocked && (
          <>
            <DelimiterWithText langKey="PremiumOr" />
            <Part
              title={i18n(details.title2)}
              text={i18n(details.text2, [titles[1]])}
              buttonText={details.buttonText2}
              onClick={() => {
                setShow(false);
                showPremiumPopup();
              }}
              isPremium
            />
          </>
        )}
      </PopupElement.Body>
    </PopupElement>
  ));
}
