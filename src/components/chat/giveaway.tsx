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
import wrapLocalSticker from '../wrappers/localSticker';
import {For, JSX} from 'solid-js';
import wrapPeerTitle from '../wrappers/peerTitle';
import PopupElement from '../popups';
import PopupGiftLink from '../popups/giftLink';
import classNames from '../../helpers/string/classNames';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {IconTsx} from '../iconTsx';

export function getGiftAssetName(months?: number) {
  const durationAssetMap: {[key: number]: LottieAssetName} = {
    3: 'Gift3',
    6: 'Gift6',
    12: 'Gift12'
  };

  return durationAssetMap[clamp(months ?? 0, 3, 12)];
}

export function DelimiterWithText(props: {langKey: LangPackKey}) {
  return (
    <span class="delimiter-with-text">
      <span class="delimiter-with-text-stripe" />
      {i18n(props.langKey)}
      <span class="delimiter-with-text-stripe" />
    </span>
  );
}

export async function onGiveawayClick(message: Message.message) {
  const giveaway = message.media as MessageMedia.messageMediaGiveaway | MessageMedia.messageMediaGiveawayResults;
  const giveawayInfo = await rootScope.managers.appPaymentsManager.getGiveawayInfo(message.peerId, message.mid);
  const d = document.createDocumentFragment();
  const duration = formatMonthsDuration(giveaway.months, true);
  const giveawayPeerId = (message as Message.message).fwdFromId || message.peerId;

  const isMediaResults = giveaway._ === 'messageMediaGiveawayResults';
  const isResults = giveawayInfo._ === 'payments.giveawayInfoResults';
  const isRefunded = isResults && giveawayInfo.pFlags.refunded;
  const isWinner = !isRefunded && isResults && giveawayInfo.pFlags.winner;
  const isParticipating = !isResults && giveawayInfo.pFlags.participating;
  const isStars = !!giveaway.stars;
  const onlyNewSubscribers = giveaway.pFlags.only_new_subscribers;
  const quantity = isMediaResults ? giveaway.winners_count + giveaway.unclaimed_count : giveaway.quantity;
  const additionalPeersLength = isMediaResults ? giveaway.additional_peers_count || 0 : giveaway.channels.length - 1;

  const formatDate = (timestamp: number) => formatFullSentTime(timestamp, undefined, true);

  let subtitleKey: LangPackKey = 'Giveaway.Info';
  const subtitleArgs: FormatterArguments = [
    formatDate(isResults ? giveawayInfo.finish_date : giveaway.until_date),
    i18n('Giveaway.Info.Users', [quantity]),
    await wrapPeerTitle({peerId: giveawayPeerId})
  ];

  if(additionalPeersLength) {
    subtitleKey += '.Several';
    subtitleArgs.push(i18n('Giveaway.Info.OtherChannels', [additionalPeersLength]));
  }
  if(onlyNewSubscribers) {
    subtitleKey += '.Date';
    subtitleArgs.push(formatDate(giveawayInfo.start_date));
  }
  if(isResults) subtitleKey += '.End';

  let subsubtitleKey: LangPackKey,
    subsubtitleArgs: FormatterArguments,
    subsubtitleAtTop: boolean;
  if(isRefunded) {
    subsubtitleKey = 'BoostingGiveawayCanceledByPayment';
  } else if(isWinner) {
    subsubtitleKey = 'Giveaway.Won';
    subsubtitleArgs = [
      wrapEmojiText('🏆')
    ];
    subsubtitleAtTop = true;
  } else if(isResults) {
    subsubtitleKey = 'BoostingGiveawayYouNotWon';
    subsubtitleAtTop = true;
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

    if(additionalPeersLength) {
      subsubtitleKey += '.Multi';
      subsubtitleArgs.push(i18n('Giveaway.Info.OtherChannels', [additionalPeersLength]));
    }

    if(!isParticipating && giveawayInfo.start_date) {
      subsubtitleArgs.push(formatDate(giveaway.until_date));
    }
  }

  let titleLangPackKey: LangPackKey;
  if(isStars) {
    titleLangPackKey = isResults ? 'BoostingStarsGiveawayHowItWorksTextEnd' : 'BoostingStarsGiveawayHowItWorksText';
  } else {
    titleLangPackKey = isResults ? 'BoostingGiveawayHowItWorksTextEnd' : 'BoostingGiveawayHowItWorksText';
  }

  const title = i18n(
    titleLangPackKey,
    [
      giveaway.stars || quantity,
      await wrapPeerTitle({peerId: giveawayPeerId}),
      quantity,
      duration
    ]
  );

  const subtitle = i18n(subtitleKey as LangPackKey, subtitleArgs);
  const subsubtitle = i18n(subsubtitleKey as LangPackKey, subsubtitleArgs);

  if(subsubtitleAtTop || isRefunded) {
    subsubtitle.classList.add('popup-description-framed');
  }

  if(isRefunded) {
    subsubtitle.classList.add('popup-description-danger');
  }

  d.append(...[
    ...(subsubtitleAtTop ? [
      subsubtitle,
      document.createElement('br')
    ] : []),
    title,
    document.createElement('br'),
    document.createElement('br'),
    ...(giveaway.prize_description ? [
      i18n('Giveaway.AlsoPrizes', [
        await wrapPeerTitle({peerId: giveawayPeerId}),
        quantity,
        wrapEmojiText(giveaway.prize_description),
        i18n('Giveaway.AlsoPrizes2', [quantity])
      ]),
      document.createElement('br'),
      document.createElement('br')
    ] : []),
    subtitle,
    ...(isResults && giveawayInfo.activated_count ? [
      ' ',
      i18n('BoostingGiveawayUsedLinksPlural', [giveawayInfo.activated_count])
    ] : []),
    ...(!subsubtitleAtTop ? [
      document.createElement('br'),
      document.createElement('br'),
      subsubtitle
    ] : [])
  ].filter(Boolean));

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
  giveaway: MessageMedia.messageMediaGiveaway | MessageMedia.messageMediaGiveawayResults,
  loadPromises?: Promise<any>[]
}) {
  // props.giveaway.countries_iso2 = ['UA', 'PL', 'AE'];

  const middleware = createMiddleware().get();
  const giveaway = props.giveaway;
  const isResults = giveaway._ === 'messageMediaGiveawayResults';
  const quantity = isResults ? giveaway.stars ?? giveaway.winners_count : giveaway.stars ?? giveaway.quantity;
  const countriesElements = !isResults && giveaway.countries_iso2?.map((iso2) => {
    const span = document.createElement('span');
    span.classList.add('bubble-giveaway-country');
    const country = I18n.countriesList.find((country) => country.iso2 === iso2);
    span.append(wrapEmojiText(getCountryEmoji(iso2) + ' ' + (country.name || country.default_name)));
    return span;
  });

  const headerDuration = formatMonthsDuration(giveaway.months, true);
  let header: JSX.Element;
  if(isResults) {
    let a: HTMLAnchorElement;
    (
      <a
        ref={a}
        class="bubble-giveaway-link"
        data-saved-from={`${giveaway.channel_id.toPeerId(true)}_${giveaway.launch_msg_id}`}
      />
    );
    header = (
      <>
        {i18n('Giveaway.Results.Subtitle', [giveaway.winners_count, a])}
      </>
    );
  } else {
    header = giveaway.prize_description ? (
      <>
        <b>{`${quantity} `}</b>
        {wrapEmojiText(giveaway.prize_description)}
        <DelimiterWithText langKey="Giveaway.With" />
        {giveaway.stars ?
          i18n('Giveaway.WithStars', [giveaway.quantity, i18n('Giveaway.WithStars.Stars', [+giveaway.stars])]) :
          i18n(+quantity > 1 ? 'Giveaway.WithSubscriptionsPlural' : 'Giveaway.WithSubscriptionsSingle', [headerDuration])}
      </>
    ) : (
      <>
        {i18n(giveaway.stars ? 'BoostingStarsGiveawayMsgInfoPlural1' : 'BoostingGiveawayMsgInfoPlural1', [quantity])}
        <br/>
        {i18n(giveaway.stars ? 'BoostingStarsGiveawayMsgInfoPlural2' : 'BoostingGiveawayMsgInfoPlural2', [giveaway.stars ? giveaway.quantity : headerDuration])}
      </>
    );
  }

  const renderEntity = (peerId: PeerId) => {
    const entity = AppSelectPeers.renderEntity({
      key: peerId,
      middleware,
      avatarSize: 30,
      meAsSaved: false
    });

    appImManager.setPeerColorToElement({peerId, element: entity.element});

    entity.element.classList.add('bubble-giveaway-channel', 'hover-primary');

    return entity.element;
  };

  const channelsWrapped = !isResults && (
    <div class="bubble-giveaway-channels">
      <For each={giveaway.channels}>
        {(chatId) => renderEntity(chatId.toPeerId(true))}
      </For>
    </div>
  );

  const countriesWrapped = countriesElements && (
    <div class="bubble-giveaway-countries">
      {i18n(
        'BoostingGiveAwayFromCountries',
        [join(countriesElements)]
      )}
    </div>
  );

  let middle: JSX.Element;
  if(isResults) {
    middle = (
      <>
        <div class="bubble-giveaway-channels">
          <For each={giveaway.winners}>
            {(userId) => renderEntity(userId.toPeerId(false))}
          </For>
        </div>
        {giveaway.winners_count > giveaway.winners.length && (
          <div class="bubble-giveaway-and-more">
            {i18n('Giveaway.Results.AndMore', [giveaway.winners_count - giveaway.winners.length])}
          </div>
        )}
      </>
    );
  } else {
    middle = (
      <>
        {i18n(
          giveaway.pFlags.only_new_subscribers ?
            'BoostingGiveawayMsgNewSubsPlural' :
            'BoostingGiveawayMsgAllSubsPlural',
          [giveaway.channels.length]
        )}
        {channelsWrapped}
        {countriesWrapped}
      </>
    );
  }

  let stickerDiv: HTMLDivElement;
  const ret = (
    <div class={classNames('bubble-giveaway', 'no-select', 'disable-hover', isResults && 'bubble-giveaway-results')}>
      <div ref={stickerDiv} class="bubble-giveaway-sticker">
        <div class={classNames('bubble-giveaway-sticker-counter', giveaway.stars && 'bubble-giveaway-sticker-counter-stars')}>
          {giveaway.stars && <IconTsx icon="star" />}
          {giveaway.stars ? ` ${quantity}` : `X${quantity}`}
        </div>
      </div>
      <div class="bubble-giveaway-row">
        <div class="bubble-giveaway-row-title">{i18n(isResults ? 'Giveaway.Results.Title' : 'BoostingGiveawayPrizes', [isResults ? giveaway.winners_count : quantity])}</div>
        {header}
      </div>
      <div class="bubble-giveaway-row">
        <div class="bubble-giveaway-row-title">{i18n(isResults ? 'BoostingGiveawayResultsMsgWinners' : 'BoostingGiveawayMsgParticipants', [isResults ? giveaway.winners_count : quantity])}</div>
        {middle}
      </div>
      <div class="bubble-giveaway-row">
        <div class="bubble-giveaway-row-title">
          {isResults && giveaway.stars ?
            i18n(giveaway.winners_count > 1 ? 'Giveaway.Results.Stars.Winners.Single' : 'Giveaway.Results.Stars.Winners.Single', [i18n('Giveaway.Results.Stars.Winners.Stars', [quantity])]) :
            i18n(isResults ? 'Giveaway.Results.Footer' : 'BoostingWinnersDate', [quantity, giveaway.stars])}
        </div>
        {!isResults && formatFullSentTime(giveaway.until_date)}
      </div>
    </div>
  );

  const size = isResults ? 80 : 160;
  const promise = wrapLocalSticker({
    width: size,
    height: size,
    assetName: isResults ? 'Congratulations' : getGiftAssetName(giveaway.months),
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
