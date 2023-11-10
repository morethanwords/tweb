/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {formatFullSentTime, formatMonthsDuration} from '../../helpers/date';
import liteMode from '../../helpers/liteMode';
import clamp from '../../helpers/number/clamp';
import {Message, MessageMedia} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import I18n, {FormatterArguments, LangPackKey, i18n, join} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {LottieAssetName} from '../../lib/rlottie/lottieLoader';
import rootScope from '../../lib/rootScope';
import {getCountryEmoji} from '../../vendor/emoji';
import AppSelectPeers from '../appSelectPeers';
import confirmationPopup from '../confirmationPopup';
import {createMiddleware} from '../stories/viewer';
import wrapLocalSticker from '../wrappers/localSticker';
import {For} from 'solid-js';
import wrapPeerTitle from '../wrappers/peerTitle';
import PopupElement from '../popups';
import PopupGiftLink from '../popups/giftLink';

export function getGiftAssetName(months: number) {
  const durationAssetMap: {[key: number]: LottieAssetName} = {
    3: 'Gift3',
    6: 'Gift6',
    12: 'Gift12'
  };

  return durationAssetMap[clamp(months, 3, 12)];
}

export async function onGiveawayClick(message: Message.message) {
  const giveaway = message.media as MessageMedia.messageMediaGiveaway;
  const giveawayInfo = await rootScope.managers.appPaymentsManager.getGiveawayInfo(message.peerId, message.mid);
  const d = document.createDocumentFragment();
  const duration = formatMonthsDuration(giveaway.months, true);
  const giveawayPeerId = (message as Message.message).fwdFromId || message.peerId;

  const isResults = giveawayInfo._ === 'payments.giveawayInfoResults';
  const isRefunded = isResults && giveawayInfo.pFlags.refunded;
  const isWinner = !isRefunded && isResults && giveawayInfo.pFlags.winner;
  const isParticipating = !isResults && giveawayInfo.pFlags.participating;

  const formatDate = (timestamp: number) => formatFullSentTime(timestamp, undefined, true);

  let subtitleKey: LangPackKey = 'Giveaway.Info';
  const subtitleArgs: FormatterArguments = [
    formatDate(isResults ? giveawayInfo.finish_date : giveaway.until_date),
    i18n('Giveaway.Info.Users', [giveaway.quantity]),
    await wrapPeerTitle({peerId: giveawayPeerId})
  ];

  if(giveaway.channels.length > 1) {
    subtitleKey += '.Several';
    subtitleArgs.push(i18n('Giveaway.Info.OtherChannels', [giveaway.channels.length - 1]));
  }
  if(giveawayInfo.start_date) {
    subtitleKey += '.Date';
    subtitleArgs.push(formatDate(giveawayInfo.start_date));
  }
  if(isResults) subtitleKey += '.End';

  let subsubtitleKey: LangPackKey,
    subsubtitleArgs: FormatterArguments;
  if(isRefunded) {
    subsubtitleKey = 'BoostingGiveawayCanceledByPayment';
  } else if(isWinner) {
    subsubtitleKey = 'Giveaway.Won';
    subsubtitleArgs = [
      wrapEmojiText('🏆')
    ];
  } else if(isResults) {
    subsubtitleKey = 'BoostingGiveawayYouNotWon';
  } else if(giveawayInfo.joined_too_early_date) {
    subsubtitleKey = 'BoostingGiveawayNotEligible';
    subsubtitleArgs = [
      formatDate(giveawayInfo.joined_too_early_date)
    ];
  } else if(giveawayInfo.disallowed_country) {
    subsubtitleKey = 'BoostingGiveawayNotEligibleCountry';
  } else if(giveawayInfo.admin_disallowed_chat_id) {
    subsubtitleKey = 'BoostingGiveawayNotEligibleAdmin';
    subsubtitleArgs = [
      await wrapPeerTitle({peerId: giveawayInfo.admin_disallowed_chat_id.toPeerId(true)})
    ];
  } else {
    subsubtitleKey = isParticipating ? 'Giveaway.Participation' : 'Giveaway.TakePart';
    subsubtitleArgs = [
      await wrapPeerTitle({peerId: giveawayPeerId})
    ];

    if(giveaway.channels.length > 1) {
      subsubtitleKey += '.Multi';
      subsubtitleArgs.push(i18n('Giveaway.Info.OtherChannels', [giveaway.channels.length - 1]));
    }

    if(!isParticipating && giveawayInfo.start_date) {
      subsubtitleArgs.push(formatDate(giveawayInfo.start_date));
    }
  }

  const title = i18n(
    isResults ? 'BoostingGiveawayHowItWorksTextEnd' : 'BoostingGiveawayHowItWorksText',
    [
      await wrapPeerTitle({peerId: giveawayPeerId}),
      giveaway.quantity,
      duration
    ]
  );

  const subtitle = i18n(subtitleKey as LangPackKey, subtitleArgs);
  const subsubtitle = i18n(subsubtitleKey as LangPackKey, subsubtitleArgs);

  if(isRefunded) {
    subsubtitle.classList.add('popup-description-danger');
  }

  d.append(
    title,
    document.createElement('br'),
    document.createElement('br'),
    subtitle,
    ...(isResults && giveawayInfo.activated_count ? [
      ' ',
      i18n('BoostingGiveawayUsedLinksPlural', [giveawayInfo.activated_count])
    ] : []),
    document.createElement('br'),
    document.createElement('br'),
    subsubtitle
  );

  await confirmationPopup({
    titleLangKey: isResults ? 'BoostingGiveawayEnd' : 'BoostingGiveAwayAbout',
    description: d,
    button: isWinner ? {
      langKey: 'BoostingGiveawayViewPrize'
    } : {
      langKey: 'OK',
      isCancel: true
    }
  });

  if(isWinner) {
    PopupElement.createPopup(PopupGiftLink, giveawayInfo.gift_code_slug);
  }
}

export default function Giveaway(props: {
  giveaway: MessageMedia.messageMediaGiveaway,
  loadPromises?: Promise<any>[]
}) {
  // props.giveaway.countries_iso2 = ['UA', 'PL', 'AE'];

  const countriesWrapped = props.giveaway.countries_iso2?.map((iso2) => {
    const span = document.createElement('span');
    span.classList.add('bubble-giveaway-country');
    const country = I18n.countriesList.find((country) => country.iso2 === iso2);
    span.append(wrapEmojiText(getCountryEmoji(iso2) + ' ' + (country.name || country.default_name)));
    return span;
  });

  const middleware = createMiddleware().get();
  let stickerDiv: HTMLDivElement;
  const ret = (
    <div class="bubble-giveaway no-select disable-hover">
      <div ref={stickerDiv} class="bubble-giveaway-sticker">
        <div class="bubble-giveaway-sticker-counter">{`X${props.giveaway.quantity}`}</div>
      </div>
      <div class="bubble-giveaway-row">
        <div class="bubble-giveaway-row-title">{i18n('BoostingGiveawayPrizes')}</div>
        {i18n('BoostingGiveawayMsgInfoPlural1', [props.giveaway.quantity])}
        <br/>
        {i18n('BoostingGiveawayMsgInfoPlural2', [formatMonthsDuration(props.giveaway.months, true)])}
      </div>
      <div class="bubble-giveaway-row">
        <div class="bubble-giveaway-row-title">{i18n('BoostingGiveawayMsgParticipants')}</div>
        {i18n(props.giveaway.pFlags.only_new_subscribers ? 'BoostingGiveawayMsgNewSubsPlural' : 'BoostingGiveawayMsgAllSubsPlural', [props.giveaway.channels.length])}
        <div class="bubble-giveaway-channels">
          <For each={props.giveaway.channels}>
            {(chatId) => {
              const peerId = chatId.toPeerId(true);
              const entity = AppSelectPeers.renderEntity({
                key: peerId,
                middleware,
                avatarSize: 30
              });

              appImManager.setPeerColorToElement(peerId, entity.element);

              entity.element.classList.add('bubble-giveaway-channel', 'hover-primary');

              return entity.element;
            }}
          </For>
        </div>
        {props.giveaway.countries_iso2 && (
          <div class="bubble-giveaway-countries">
            {i18n(
              'BoostingGiveAwayFromCountries',
              [join(countriesWrapped)]
            )}
          </div>
        )}
      </div>
      <div class="bubble-giveaway-row">
        <div class="bubble-giveaway-row-title">{i18n('BoostingWinnersDate')}</div>
        {formatFullSentTime(props.giveaway.until_date)}
      </div>
    </div>
  );

  const size = 160;
  const promise = wrapLocalSticker({
    width: size,
    height: size,
    assetName: getGiftAssetName(props.giveaway.months),
    middleware,
    loop: false,
    autoplay: liteMode.isAvailable('stickers_chat')
  }).then(({container, promise}) => {
    stickerDiv.style.position = 'relative';
    stickerDiv.style.width = stickerDiv.style.height = size + 'px';
    stickerDiv.append(container);
    return promise;
  });

  props.loadPromises.push(promise);

  return ret;
}
