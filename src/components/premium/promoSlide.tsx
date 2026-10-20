import {createEffect, createSignal, For, JSX, onCleanup, Show} from 'solid-js';
import {i18n} from '@lib/langPack';
import {PREMIUM_FEATURES_COLORS, PremiumPromoFeature} from '@components/premium/featuresConfig';
import {IconTsx} from '@components/iconTsx';
import {PremiumPromoData} from '@components/premium/types';
import {PremiumSubscriptionOption} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import rootScope from '@lib/rootScope';
import {PeerTitleOptions} from '@components/peerTitle';
import {InviteLink} from '@components/sidebarLeft/tabs/inviteLink';
import anchorCallback from '@helpers/dom/anchorCallback';
import {shareGiftLink} from '@components/popups/giftLink';
import lastItem from '@helpers/array/lastItem';
import maybe2x from '@helpers/maybe2x';
import wrapSticker from '@components/wrappers/sticker';
import showStickersPopup from '@components/popups/stickers';
import PremiumOptionsForm from '@components/premium/premiumOptionsForm';
import RowTsx from '@components/rowTsx';
import PopupElement from '@components/popups/indexTsx';
import MediaHeader from '@components/mediaHeader';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export function getGiftDetails(data: PremiumPromoData) {
  const gift = data.gift;
  if(!gift) {
    return;
  }

  let fromPeerId: PeerId;
  if(gift._ === 'payments.checkedGiftCode') {
    fromPeerId = getPeerId(gift.from_id) || data.peerId;
  } else {
    fromPeerId = data.isOut ? rootScope.myId : data.peerId;
  }

  const toPeerId = (data.isOut ? data.peerId : rootScope.myId) || rootScope.myId;

  const isOutbound = toPeerId !== rootScope.myId;
  const isUnclaimed = gift._ !== 'payments.checkedGiftCode' || !gift.used_date;
  return {fromPeerId, toPeerId, isOutbound, isUnclaimed, gift};
}

/**
 * The first slide: the star (or a peer's emoji status), a heading, the subscription
 * options and the list of features, all inside its own scroll container.
 */
export default function PromoSlide(props: {
  data: PremiumPromoData,
  onSelectFeature: (feature: PremiumPromoFeatureType) => void,
  onSelectPeriod: (option: PremiumSubscriptionOption) => void,
  onClose: (callback?: () => void) => void
}) {
  const [scrollTop, setScrollTop] = createSignal(0);
  const [notBottom, setNotBottom] = createSignal(true);

  const onScroll = (e: Event) => {
    const target = e.currentTarget as HTMLElement;
    setScrollTop(target.scrollTop);
    setNotBottom((target.scrollHeight - target.scrollTop) > target.offsetHeight);
  };

  const withOptions = () => props.data.type !== 'gift' && !props.data.isPremiumActive;

  return (
    <div
      // `class` must stay static here: TransitionSlider adds `active` / `to` / `from`
      // to this .tabs-tab imperatively, and a reactive class= would rewrite className
      // wholesale and drop them — leaving an empty, hidden popup. classList only
      // toggles the keys it is given.
      class="premium-promo-tab tabs-tab premium-tab scrollable scrollable-y"
      classList={{'not-bottom': notBottom()}}
      onScroll={onScroll}
    >
      <div
        class="popup-header"
        classList={{
          'is-visible': scrollTop() > 100,
          'not-top': scrollTop() > 0
        }}
      >
        <div class="popup-header-background" />
        <PopupElement.CloseButton />
        <div class="popup-title" dir="auto">{i18n(headingTitleKey(props.data))}</div>
      </div>
      <div class="popup-body">
        <HeaderImage data={props.data} />
        <Heading data={props.data} onClose={props.onClose} />
        <Show when={withOptions()}>
          <PremiumOptionsForm
            periodOptions={props.data.premiumPromo.period_options}
            onOption={props.onSelectPeriod}
          />
        </Show>
        <div class="popup-premium-features-container">
          <PremiumFeatures
            features={props.data.features}
            order={props.data.order}
            onSelect={props.onSelectFeature}
          />
          <Show when={props.data.type === 'premium' && props.data.premiumPromo.status_text}>
            <StatusText data={props.data} onClose={props.onClose} />
          </Show>
        </div>
      </div>
    </div>
  );
}

const headingTitleKey = (data: PremiumPromoData) => (
  data.type === 'business' ? 'TelegramBusiness' : 'Premium.Boarding.Title'
);

function PremiumFeatures(props: {
  features: PremiumPromoFeature[],
  order: PremiumPromoFeatureType[],
  onSelect: (feature: PremiumPromoFeatureType) => void
}) {
  return (
    <For each={props.order}>{(type, index) => {
      const feature = props.features.find((item) => item.feature === type);
      const color = PREMIUM_FEATURES_COLORS[index()] ?? lastItem(PREMIUM_FEATURES_COLORS);
      return (
        <RowTsx clickable={() => props.onSelect(feature.feature)}>
          <RowTsx.Title>
            {i18n(feature.titleLangKey, feature.titleLangArgs)}
            {feature.new && (
              <span class="row-title-badge" style={{'background-color': color}}>{i18n('New')}</span>
            )}
          </RowTsx.Title>
          {feature.subtitleLangKey && (
            <RowTsx.Subtitle>{i18n(feature.subtitleLangKey, feature.subtitleLangArgs)}</RowTsx.Subtitle>
          )}
          <RowTsx.Media
            class="premium-promo-tab-icon"
            size="small"
            style={{'background-color': color}}
          >
            <IconTsx icon={feature.icon} />
          </RowTsx.Media>
        </RowTsx>
      );
    }}</For>
  );
}

function HeaderImage(props: {data: PremiumPromoData}) {
  const emojiStatusId = props.data.emojiStatusId;

  if(!emojiStatusId) {
    return (
      <div class="popup-premium-header-image-container">
        <img class="popup-premium-header-image" src={`${maybe2x('assets/img/premium-star')}.png`} alt="" />
      </div>
    );
  }

  return (
    <div
      class="popup-premium-header-image-container is-emoji-status"
      ref={(div) => {
        rootScope.managers.appEmojiManager.getCustomEmojiDocument(emojiStatusId).then((doc) => {
          if(!props.data.middleware()) return;

          wrapSticker({
            doc,
            div,
            play: true,
            loop: true,
            group: 'EMOJI-STATUS',
            middleware: props.data.middleware,
            width: 100,
            height: 100
          });
        });
      }}
    />
  );
}

/** Title + description, which differ for a gift, a peer's status, and the plain promo. */
function Heading(props: {
  data: PremiumPromoData,
  onClose: (callback?: () => void) => void
}) {
  const [title, setTitle] = createSignal<JSX.Element>();
  const [description, setDescription] = createSignal<JSX.Element>();
  const giftDetails = getGiftDetails(props.data);
  // a title that carries a peer's name runs long, so it gets the compact scale
  const compact = !!(giftDetails || props.data.peerId);
  const wrapTitleOptions: PeerTitleOptions = {onlyFirstName: true};

  const build = async() => {
    const managers = bindManagersToSession(rootScope.managers);
    if(giftDetails) {
      const {fromPeerId, toPeerId, isOutbound, isUnclaimed, gift} = giftDetails;
      const giftText = i18n('GiftDays', [gift.days]);

      if(isOutbound) {
        setTitle(i18n('GiftModal.Title.You', [
          await wrapPeerTitle({...wrapTitleOptions, peerId: toPeerId}),
          giftText
        ]));
        setDescription(i18n(
          'TelegramPremiumUserGiftedPremiumOutboundDialogSubtitle',
          [await wrapPeerTitle({...wrapTitleOptions, peerId: toPeerId})]
        ));
        return;
      }

      setTitle(i18n(
        fromPeerId ?
          'TelegramPremiumUserGiftedPremiumDialogTitleWithPlural' :
          'TelegramPremiumUserGiftedPremiumDialogTitleWithPluralSomeone',
        [
          fromPeerId && await wrapPeerTitle({...wrapTitleOptions, peerId: fromPeerId}),
          giftText
        ].filter(Boolean)
      ));

      if(gift._ === 'messageActionGiftPremium') {
        setDescription(i18n('TelegramPremiumUserGiftedPremiumDialogSubtitle'));
        return;
      }

      const url = 'https://t.me/giftcode/' + gift.slug;
      const inviteLink = new InviteLink({
        button: false,
        listenerSetter: props.data.listenerSetter,
        url
      });

      const text = isUnclaimed ?
        i18n('GiftCode.ShareReceived', [anchorCallback(async() => {
          props.onClose();
          shareGiftLink(url);
        })]) :
        i18n('BoostingLinkUsed');

      const container = document.createElement('div');
      container.append(text, inviteLink.container);
      setDescription(container);
      return;
    }

    if(props.data.peerId && props.data.emojiStatusId) {
      const [peerTitle, doc] = await Promise.all([
        wrapPeerTitle({peerId: props.data.peerId}),
        managers.appEmojiManager.getCustomEmojiDocument(props.data.emojiStatusId)
      ]);

      if(doc.stickerSetInput) {
        const stickerset = await managers.appStickersManager.getStickerSet(doc.stickerSetInput);
        setTitle(i18n('TelegramPremiumPeerTitleEmojiStatus', [
          peerTitle,
          anchorCallback(() => showStickersPopup(doc.stickerSetInput, true)),
          stickerset.set.title
        ]));
      } else {
        setTitle(i18n('TelegramPremiumPeerTitleEmojiStatusNoPack', [peerTitle]));
      }

      setDescription(i18n('TelegramPremiumPeerSubtitleEmojiStatus'));
      return;
    }

    if(props.data.peerId) {
      setTitle(i18n('TelegramPremiumPeerTitle', [await wrapPeerTitle({peerId: props.data.peerId})]));
      setDescription(i18n('TelegramPremiumPeerSubtitle'));
      return;
    }

    if(props.data.type === 'business') {
      setTitle(i18n('TelegramBusiness'));
      setDescription(i18n(props.data.isPremiumActive ?
        'TelegramBusinessSubscribedSubtitle' :
        'TelegramBusinessSubtitle'
      ));
      return;
    }

    setTitle(i18n(props.data.isPremiumActive ? 'TelegramPremiumSubscribedTitle' : 'Premium.Boarding.Title'));
    setDescription(i18n(props.data.isPremiumActive ? 'TelegramPremiumSubscribedSubtitle' : 'Premium.Boarding.Info'));
  };

  build();

  return (
    <MediaHeader class="popup-premium-heading-text-container">
      <MediaHeader.Title size={compact ? 20 : 24}>{title()}</MediaHeader.Title>
      <MediaHeader.Subtitle>{description()}</MediaHeader.Subtitle>
    </MediaHeader>
  );
}

/** The server-supplied promo footer, whose links close the popup before navigating. */
function StatusText(props: {
  data: PremiumPromoData,
  onClose: (callback?: () => void) => void
}) {
  let element!: HTMLDivElement;

  const onClick = (e: MouseEvent) => {
    const callback = hotReloadGuard.onMediaCaptionClick(element, e);
    if(!callback) return;

    props.onClose(callback);
  };

  createEffect(() => {
    setInnerHTML(element, wrapRichText(props.data.premiumPromo.status_text, {
      entities: props.data.premiumPromo.status_entities
    }));
  });

  return (
    <div
      class="popup-premium-status-text"
      ref={(el) => {
        element = el;
        el.addEventListener('click', onClick, {capture: true});
        onCleanup(() => el.removeEventListener('click', onClick, {capture: true}));
      }}
    />
  );
}
