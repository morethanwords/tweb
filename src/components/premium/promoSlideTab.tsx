import {For} from 'solid-js';
import {i18n} from '@lib/langPack';
import {PREMIUM_FEATURES_COLORS, PremiumPromoFeature} from '@components/premium/featuresConfig';
import TransitionSlider from '@components/transition';
import {IconTsx} from '@components/iconTsx';
import {PopupPremiumProps} from '@components/popups/premium';
import {PremiumSubscriptionOption} from '@layer';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {onMediaCaptionClick} from '@components/mediaViewer';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import rootScope from '@lib/rootScope';
import {PeerTitleOptions} from '@components/peerTitle';
import {InviteLink} from '@components/sidebarLeft/tabs/inviteLink';
import anchorCallback from '@helpers/dom/anchorCallback';
import PopupGiftLink from '@components/popups/giftLink';
import lastItem from '@helpers/array/lastItem';
import maybe2x from '@helpers/maybe2x';
import wrapSticker from '@components/wrappers/sticker';
import showStickersPopup from '@components/popups/stickers';
import PremiumOptionsForm from '@components/premium/premiumOptionsForm';
import RowTsx from '@components/rowTsx';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';

type PromoSlideTabOptions = PopupPremiumProps & {
  container: HTMLElement,
  header: HTMLElement,
  body: HTMLElement
};

function PremiumFeatures(props: {
  features: PremiumPromoFeature[],
  order: PremiumPromoFeatureType[],
  onSelect: (feature: PremiumPromoFeatureType) => Promise<void>
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

export function getGiftDetails(options: PopupPremiumProps) {
  const gift = options.gift;
  if(!gift) {
    return;
  }

  let fromPeerId: PeerId, toPeerId: PeerId;
  if(gift._ === 'payments.checkedGiftCode') {
    fromPeerId = getPeerId(gift.from_id) || options.peerId;
  } else {
    fromPeerId = options.isOut ? rootScope.myId : options.peerId;
  }

  toPeerId = options.isOut ? options.peerId : rootScope.myId;
  toPeerId ||= rootScope.myId;

  const isOutbound = toPeerId !== rootScope.myId;
  const isUnclaimed = gift._ !== 'payments.checkedGiftCode' || !gift.used_date;
  return {fromPeerId, toPeerId, isOutbound, isUnclaimed, gift};
}

export default class PromoSlideTab {
  public tab: HTMLElement;
  public transition: ReturnType<typeof TransitionSlider>;
  public selectFeature: (feature: PremiumPromoFeatureType) => Promise<void>;
  public selectPeriod: (option: PremiumSubscriptionOption) => void;
  public close: (callback?: () => void) => void;

  public initPromise: Promise<void>;

  constructor(public options: PromoSlideTabOptions) {
    this.initPromise = this.initPremiumTab(options);
  }

  private async initPremiumTab(options: PromoSlideTabOptions) {
    const tab = this.tab = document.createElement('div');
    tab.append(options.header, options.body);
    tab.classList.add('premium-promo-tab', 'not-bottom', 'scrollable', 'scrollable-y');
    tab.addEventListener('scroll', this.onTabScroll);

    options.body.append(...(await Promise.all([
      this.createImageContainer(),
      this.createHeading(),
      options.type === 'premium' && !options.isPremiumActive && this.createOptionsForm(),
      this.createFeaturesContainer()
    ])).filter(Boolean));
    options.container.classList.add('fixed-size');
  }

  private async createHeading() {
    const headingTextContainer = document.createElement('div');
    headingTextContainer.classList.add('popup-premium-heading-text-container');
    const headingTextTitle = document.createElement('div');
    headingTextTitle.classList.add('popup-premium-heading-text-title');
    const headingTextDescription = document.createElement('div');
    headingTextDescription.classList.add('popup-premium-heading-text-description');

    const wrapTitleOptions: PeerTitleOptions = {onlyFirstName: true};

    let title: HTMLElement, description: HTMLElement;
    const giftDetails = getGiftDetails(this.options);
    if(giftDetails) {
      headingTextTitle.classList.add('smaller-text');
      const {fromPeerId, toPeerId, isOutbound, isUnclaimed, gift} = giftDetails;
      const giftText = i18n('GiftDays', [gift.days]);
      if(isOutbound) {
        title = i18n(
          'GiftModal.Title.You',
          [
            await wrapPeerTitle({...wrapTitleOptions, peerId: toPeerId}),
            giftText
          ]
        );
      } else {
        title = i18n(
          fromPeerId ?
            'TelegramPremiumUserGiftedPremiumDialogTitleWithPlural' :
            'TelegramPremiumUserGiftedPremiumDialogTitleWithPluralSomeone',
          [
            fromPeerId && await wrapPeerTitle({...wrapTitleOptions, peerId: fromPeerId}),
            giftText
          ].filter(Boolean)
        );
      }

      if(isOutbound) {
        description = i18n(
          'TelegramPremiumUserGiftedPremiumOutboundDialogSubtitle',
          [await wrapPeerTitle({...wrapTitleOptions, peerId: toPeerId})]
        );
      } else {
        if(gift._ === 'messageActionGiftPremium') {
          description = i18n('TelegramPremiumUserGiftedPremiumDialogSubtitle');
        } else {
          const url = 'https://t.me/giftcode/' + gift.slug;

          const inviteLink = new InviteLink({
            button: false,
            listenerSetter: this.options.listenerSetter,
            url
          });

          let text: HTMLElement;
          if(!isUnclaimed) {
            text = i18n('BoostingLinkUsed');
          } else {
            text = i18n(
              'GiftCode.ShareReceived',
              [
                anchorCallback(async() => {
                  this.close();
                  PopupGiftLink.shareGiftLink(url);
                })
              ]
            );
          }

          description = document.createElement('div');
          description.append(text, inviteLink.container);
        }
      }
    } else if(this.options.peerId && this.options.emojiStatusId) {
      headingTextTitle.classList.add('smaller-text');
      const [peerTitle, doc] = await Promise.all([
        wrapPeerTitle({peerId: this.options.peerId}),
        rootScope.managers.appEmojiManager.getCustomEmojiDocument(this.options.emojiStatusId)
      ]);
      if(doc.stickerSetInput) {
        const stickerset = await rootScope.managers.appStickersManager.getStickerSet(doc.stickerSetInput);
        title = i18n('TelegramPremiumPeerTitleEmojiStatus', [
          peerTitle,
          anchorCallback(() => {
            showStickersPopup(doc.stickerSetInput, true)
          }),
          stickerset.set.title
        ])
      } else {
        title = i18n('TelegramPremiumPeerTitleEmojiStatusNoPack', [peerTitle])
      }
      description = i18n('TelegramPremiumPeerSubtitleEmojiStatus');
    } else if(this.options.peerId) {
      headingTextTitle.classList.add('smaller-text');
      title = i18n('TelegramPremiumPeerTitle', [
        await wrapPeerTitle({peerId: this.options.peerId})
      ])
      description = i18n('TelegramPremiumPeerSubtitle');
    } else {
      title = this.options.isPremiumActive ? i18n('TelegramPremiumSubscribedTitle') : i18n('Premium.Boarding.Title');
      description = this.options.isPremiumActive ? i18n('TelegramPremiumSubscribedSubtitle') : i18n('Premium.Boarding.Info');
    }

    headingTextTitle.append(title);
    headingTextDescription.append(description);
    headingTextContainer.append(headingTextTitle, headingTextDescription);
    return headingTextContainer;
  }

  private createFeaturesContainer() {
    const statusText = this.options.type === 'premium' &&
      this.options.premiumPromo.status_text &&
      this.createStatusText();
    return wrapSolidComponent(() => (
      <div class="popup-premium-features-container">
        <PremiumFeatures
          features={this.options.features}
          order={this.options.order}
          onSelect={async(feature) => {
            this.transition(1);
            await this.selectFeature(feature);
          }}
        />
        {statusText}
      </div>
    ), this.options.middleware);
  }

  private async createImageContainer() {
    const premiumImageContainer = document.createElement('div');
    premiumImageContainer.classList.add('popup-premium-header-image-container');
    if(this.options.emojiStatusId) {
      premiumImageContainer.classList.add('is-emoji-status')
      const doc = await rootScope.managers.appEmojiManager.getCustomEmojiDocument(this.options.emojiStatusId);
      await wrapSticker({
        doc,
        div: premiumImageContainer,
        play: true,
        loop: true,
        group: 'EMOJI-STATUS',
        middleware: this.options.middleware,
        width: 100,
        height: 100
      });
      return premiumImageContainer;
    } else {
      const premiumImage = document.createElement('img');
      premiumImage.src = `${maybe2x('assets/img/premium-star')}.png`;
      premiumImage.classList.add('popup-premium-header-image');
      premiumImageContainer.append(premiumImage);
      return premiumImageContainer;
    }
  }

  private createStatusText() {
    const statusText = document.createElement('div');
    statusText.classList.add('popup-premium-status-text');
    const wrapped = wrapRichText(this.options.premiumPromo.status_text, {entities: this.options.premiumPromo.status_entities});
    setInnerHTML(statusText, wrapped);

    const onClick = (e: MouseEvent) => {
      const callback = onMediaCaptionClick(statusText, e);
      if(!callback) {
        return;
      }

      this.close(() => {
        statusText.removeEventListener('click', onClick, {capture: true});
        callback();
      });
    };

    statusText.addEventListener('click', onClick, {capture: true});
    return statusText;
  }

  private createOptionsForm() {
    return wrapSolidComponent(() => (
      <PremiumOptionsForm
        periodOptions={this.options.premiumPromo.period_options}
        onOption={(option) => this.selectPeriod?.(option)}
      />
    ), this.options.middleware);
  }

  private onTabScroll = () => {
    const {tab, options} = this;
    const {scrollTop, scrollHeight} = tab;
    options.header.classList.toggle('is-visible', scrollTop > 100);
    options.header.classList.toggle('not-top', scrollTop > 0);
    tab.classList.toggle('not-bottom', (scrollHeight - scrollTop) > tab.offsetHeight);
  };
}
