import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {PaymentsCheckedGiftCode} from '@layer';
import renderImageFromUrl from '@helpers/dom/renderImageFromUrl';
import {LangPackKey, i18n} from '@lib/langPack';
import {InviteLink} from '@components/sidebarLeft/tabs/inviteLink';
import {createSignal, JSX, onCleanup, onMount} from 'solid-js';
import {formatDaysDuration, formatFullSentTime} from '@helpers/date';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import appImManager, {ChatSetPeerOptions} from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import PeerTitle from '@components/peerTitle';
import shareUrlToPeers from '@components/popups/shareUrl';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import {toastNew} from '@components/toast';
import shouldDisplayGiftCodeAsGift from '@helpers/shouldDisplayGiftCodeAsGift';
import PopupPremium from '@components/popups/premium';
import confirmationPopup from '@components/confirmationPopup';
import anchorCallback from '@helpers/dom/anchorCallback';
import DotRenderer from '@components/dotRenderer';
import themeController from '@helpers/themeController';
import Table, {TablePeer} from '@components/table';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware} from '@helpers/middleware';

const ANIMATION_GROUP = 'STICKERS-POPUP';

export function shareGiftLink(url: string, openAfter?: boolean) {
  shareUrlToPeers({
    url,
    openAfter,
    toastKey: 'BoostingGiftLinkForwardedTo',
    toastKeyForSelf: 'BoostingGiftLinkForwardedToSavedMsg'
  });
}

export async function applyGiftCode(slug: string, button: HTMLElement, hide: () => void) {
  const toggle = toggleDisability(button, true);
  try {
    await rootScope.managers.appPaymentsManager.applyGiftCode(slug);
    hide();
    toastNew({langPackKey: 'GiftLink.UseSuccess'});
  } catch(err) {
    if((err as ApiError).type.includes('PREMIUM_SUB_ACTIVE_UNTIL_')) {
      hide();
      const timestamp = +(err as ApiError).type.split('_').pop();
      const button: Parameters<typeof confirmationPopup>[0]['button'] = {
        langKey: 'OK',
        isCancel: true
      };
      confirmationPopup({
        titleLangKey: 'GiftPremiumActivateErrorTitle',
        descriptionLangKey: 'GiftCode.Activation.After',
        descriptionLangArgs: [
          formatFullSentTime(timestamp),
          anchorCallback(() => {
            simulateClickEvent(button.element);
            hide();
            shareGiftLink('https://t.me/giftcode/' + slug);
          })
        ],
        button
      });
    }

    console.error('giftcode error', err);
    toggle();
  }
}

export default async function showGiftLinkPopup(
  slug: string,
  stack?: ChatSetPeerOptions['stack'],
  checkedGiftCode?: PaymentsCheckedGiftCode
) {
  const isInChat = !!checkedGiftCode;
  const giftCode = checkedGiftCode ?? await rootScope.managers.appPaymentsManager.checkGiftCode(slug);
  if(shouldDisplayGiftCodeAsGift(giftCode)) {
    PopupPremium.show({gift: giftCode, stack});
    return;
  }

  const middlewareHelper = getMiddleware();

  let dotsCanvas: HTMLElement;
  if(isInChat && !giftCode.used_date) {
    const {canvas, readyResult} = DotRenderer.create({
      width: 320,
      height: 32,
      middleware: middlewareHelper.get(),
      animationGroup: ANIMATION_GROUP,
      config: {
        particlesCount: 1000,
        color: themeController.isNight() ? 0xffffff : 0x000000
      }
    });

    await readyResult;
    dotsCanvas = canvas;
  }

  // the table and the share line close the popup to walk somewhere else
  const [show, setShow] = createSignal(true);
  const deferredCloseCallbacks: (() => void)[] = [];
  const hideWithCallback = (callback: () => void) => {
    deferredCloseCallbacks.push(callback);
    setShow(false);
  };

  const isUsed = !!giftCode.used_date;
  const titleLangKey: LangPackKey = isUsed ? 'BoostingUsedGiftLink' : 'BoostingGiftLink';
  const url = isInChat && !isUsed ? '' : 'https://t.me/giftcode/' + slug;
  const canUseLink = !isInChat && !isUsed;

  createPopup(() => {
    const listenerSetter = new ListenerSetter();
    onCleanup(() => {
      listenerSetter.removeAll();
      middlewareHelper.destroy();
    });

    const inviteLink = new InviteLink({
      button: false,
      listenerSetter,
      url,
      noRightButton: !url,
      onClick: !url && (() => {
        toastNew({langPackKey: 'BoostingOnlyRecipientCode'});
      })
    });

    if(dotsCanvas) {
      dotsCanvas.classList.add('invite-link-dots');
      inviteLink.container.appendChild(dotsCanvas);
    }

    const makePeer = (peerId: PeerId) => (
      <TablePeer
        peerId={peerId}
        onClick={() => {
          hideWithCallback(() => {
            appImManager.setInnerPeer({peerId});
          });
        }}
      />
    );

    const isGiveaway = giftCode.pFlags.via_giveaway;

    const fromPeerId = getPeerId(giftCode.from_id);
    const toPeerId = giftCode.to_id && getPeerId(giftCode.to_id);

    const giveawayAnchor = (giftCode.giveaway_msg_id || isGiveaway) && anchorCallback(() => {
      hideWithCallback(() => {
        appImManager.setInnerPeer({
          peerId: fromPeerId,
          lastMsgId: giftCode.giveaway_msg_id
        });
      });
    });
    giveawayAnchor?.append(i18n('BoostingIncompleteGiveaway'));

    const reasonValue = toPeerId ? (
      toPeerId === rootScope.myId ?
        i18n('BoostingYouWereSelected') :
        i18n('BoostingUserWasSelected', [new PeerTitle({peerId: toPeerId}).element])
    ) : giveawayAnchor;

    const content: [LangPackKey, JSX.Element][] = ([
      ['BoostingFrom', makePeer(fromPeerId)],
      ['BoostingTo', toPeerId ? makePeer(toPeerId) : i18n('BoostingNoRecipient')],
      ['BoostingGift', i18n('BoostingTelegramPremiumFor', [formatDaysDuration(giftCode.days)])],
      !isInChat && ['BoostingReason', reasonValue],
      ['BoostingDate', formatFullSentTime(giftCode.date, undefined, true)]
    ] as [LangPackKey, JSX.Element][]).filter(Boolean);

    const shareLink = anchorCallback(() => {
      hideWithCallback(() => {
        shareGiftLink(url, true);
      });
    });

    let img: HTMLImageElement;
    let confirmButton: HTMLButtonElement;

    const wrapper = (
      <div class="popup-gift-link-wrapper">
        <div class="popup-gift-link-header">
          <img ref={img} class="popup-gift-link-image" />
          <div class="popup-gift-link-title">{i18n(titleLangKey)}</div>
          <div class="popup-gift-link-subtitle">
            {
              isUsed ?
                i18n('BoostingLinkUsed') :
                i18n(
                  toPeerId === rootScope.myId ? 'BoostingLinkAllows' : (toPeerId ? 'BoostingLinkAllowsToUser' : 'BoostingLinkAllowsAnyone'),
                  toPeerId ? [new PeerTitle({peerId: toPeerId}).element] : undefined
                )
            }
          </div>
        </div>
        {inviteLink.container}
        <Table class="popup-gift-link-table" boldKey content={content} />
        {(!isInChat || !isUsed) && (
          <div class="popup-gift-link-share">
            {isUsed ?
              i18n('BoostingUsedLinkDate', [formatFullSentTime(giftCode.used_date, undefined, true)]) :
              isInChat && !giftCode.slug ?
                i18n('BoostingLinkNotActivated') :
                i18n(toPeerId ? 'Giveaway.SendLinkToFriend' : 'Giveaway.SendLinkToAnyone', [shareLink])
            }
          </div>
        )}
      </div>
    );

    // after mount: `decode()` on an image still being moved into the tree rejects as "broken"
    onMount(() => {
      renderImageFromUrl(img, `assets/img/premium-star${window.devicePixelRatio > 1 ? '@2x' : ''}.png`);
    });

    return (
      <PopupElement
        class="popup-boosts popup-gift-link"
        closable
        old
        animationGroup={ANIMATION_GROUP}
        show={show()}
        onCloseAfterTimeout={() => deferredCloseCallbacks.splice(0).forEach((callback) => callback())}
      >
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
          <PopupElement.Title>{i18n(titleLangKey)}</PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body>
          <PopupElement.Scrollable>
            {wrapper}
          </PopupElement.Scrollable>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            ref={(element) => confirmButton = element as HTMLButtonElement}
            callback={() => {
              if(!canUseLink) { // the popup closes on its own
                return;
              }

              applyGiftCode(slug, confirmButton, () => setShow(false));
              return false;
            }}
          >
            {i18n(canUseLink ? 'BoostingUseLink' : 'OK')}
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
