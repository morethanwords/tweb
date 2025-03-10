/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Boost, PremiumBoostsStatus, PrepaidGiveaway} from '../../../layer';
import {LangPackKey, i18n, joinElementsWith} from '../../../lib/langPack';
import Section from '../../section';
import {SliderSuperTabEventable} from '../../sliderTab';
import {Accessor, createMemo, createRoot, createSignal, For, JSX, onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import Row from '../../row';
import {avatarNew, AvatarNew} from '../../avatarNew';
import LimitLine from '../../limit';
import {LoadableList, StatisticsOverviewItems, createLoadableList, createMoreButton, makeAbsStats} from './statistics';
import PopupBoostsViaGifts, {BoostsBadge} from '../../popups/boostsViaGifts';
import Button from '../../button';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import PopupElement from '../../popups';
import {InviteLink} from '../../sidebarLeft/tabs/sharedFolder';
import {MTAppConfig} from '../../../lib/mtproto/appConfig';
import {horizontalMenu} from '../../horizontalMenu';
import classNames from '../../../helpers/string/classNames';
import {formatFullSentTime} from '../../../helpers/date';
import wrapPeerTitle from '../../wrappers/peerTitle';
import Icon from '../../icon';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import rootScope from '../../../lib/rootScope';
import PopupGiftLink from '../../popups/giftLink';
import {toastNew} from '../../toast';
import ListenerSetter from '../../../helpers/listenerSetter';
import indexOfAndSplice from '../../../helpers/array/indexOfAndSplice';
import appImManager from '../../../lib/appManagers/appImManager';
import PopupPayment from '../../popups/payment';
import formatStarsAmount from '../../../lib/appManagers/utils/payments/formatStarsAmount';

const getColorByMonths = (months: number) => {
  return months === 12 ? 'red' : (months === 3 ? 'green' : 'blue');
};

const getBoostMonths = (from: number, to: number) => {
  const days = (to - from) / 86400;
  return Math.round(days / 30);
};

export const CPrepaidGiveaway = (props: {
  giveaway: PrepaidGiveaway,
  appConfig: MTAppConfig,
  clickable?: true | (() => void),
  listenerSetter?: ListenerSetter
}) => {
  const {quantity} = props.giveaway;
  const stars = (props.giveaway as PrepaidGiveaway.prepaidStarsGiveaway).stars;
  const months = (props.giveaway as PrepaidGiveaway.prepaidGiveaway).months;
  const boosts = stars ? (props.giveaway as PrepaidGiveaway.prepaidStarsGiveaway).boosts : (props.appConfig.giveaway_boosts_per_premium || 1) * quantity;
  const row = new Row({
    titleLangKey: stars ? 'Stars' : 'BoostingGiveawayMsgInfoPlural1',
    titleLangArgs: [stars || quantity],
    subtitleLangKey: stars ? 'Giveaway.Prepaid.For' : 'Giveaway.Prepaid.Subtitle',
    subtitleLangArgs: [quantity, i18n('Giveaway.Prepaid.Period', [months])],
    clickable: props.clickable,
    listenerSetter: props.listenerSetter,
    rightContent: BoostsBadge({boosts}) as HTMLElement
  });

  row.title.classList.add('text-bold');
  const media = row.createMedia('abitbigger');
  const avatar = AvatarNew({size: 42});
  if(stars) {
    avatar.set({icon: 'star', color: 'stars'});
  } else {
    avatar.set({icon: 'gift_premium', color: getColorByMonths(months)});
  }
  media.append(avatar.node);

  return row.container;
};

export function Tabs(props: {
  tab: Accessor<number>,
  onChange: (index: number) => void,
  menu: JSX.Element[],
  content: JSX.Element[],
  class: string
}) {
  const className = props.class;

  const MenuTab = (props: {
    children: JSX.Element
  }) => {
    return (
      <div class={classNames('menu-horizontal-div-item', `${className}-tab`)}>
        <div class="menu-horizontal-div-item-span">
          {props.children}
          <i />
        </div>
      </div>
    );
  };

  const ContentTab = (props: {
    children: JSX.Element,
    hide: boolean
  }) => {
    return (
      <div
        class={classNames(`${className}-content`, props.hide && 'hide')}
      >
        {props.children}
      </div>
    );
  };

  let tabs: HTMLDivElement, content: HTMLDivElement;
  const ret = (
    <>
      <div ref={tabs} class={classNames('menu-horizontal-div', `${className}-tabs`)}>
        <For each={props.menu}>{(item) => {
          return (
            <MenuTab>{item}</MenuTab>
          );
        }}</For>
      </div>
      <div ref={content} class={classNames(`${className}-contents`)}>
        <For each={props.content}>{(item, index) => {
          return (
            <ContentTab hide={index() !== props.tab()}>{item}</ContentTab>
          );
        }}</For>
      </div>
    </>
  );

  const listenerSetter = new ListenerSetter();
  onCleanup(() => {
    listenerSetter.removeAll();
  });

  const selectTab = horizontalMenu(
    tabs,
    content,
    (tab) => {
      props.onChange(tab);
    },
    undefined,
    undefined,
    undefined,
    listenerSetter
  );
  selectTab(props.tab());

  return ret;
}

export default class AppBoostsTab extends SliderSuperTabEventable {
  private peerId: PeerId;
  private targets: Map<HTMLElement, Boost>;
  private canCreateGiveaway: boolean;

  private _construct(
    boostsStatus: PremiumBoostsStatus,
    appConfig: MTAppConfig,
    boostsList: Accessor<LoadableList>,
    giftsBoostsList: Accessor<LoadableList>
  ) {
    const limitLine = new LimitLine({
      progress: true,
      hint: {
        icon: 'boost',
        noStartEnd: true
      }
    });

    const isMaxLevel = boostsStatus.next_level_boosts === undefined;
    const progress = isMaxLevel ?
      1 :
      (boostsStatus.boosts - boostsStatus.current_level_boosts) / (boostsStatus.next_level_boosts - boostsStatus.current_level_boosts);

    limitLine.setProgress(
      progress,
      '' + boostsStatus.boosts,
      {
        from1: i18n('BoostsLevel', [boostsStatus.level]),
        to1: i18n('BoostsLevel', [boostsStatus.level + 1]),
        from2: i18n('BoostsLevel', [boostsStatus.level]),
        to2: i18n('BoostsLevel', [boostsStatus.level + 1])
      }
    );

    limitLine._setHintActive();

    const url = boostsStatus.boost_url;

    const inviteLink = new InviteLink({
      listenerSetter: this.listenerSetter,
      url
    });

    const boostsViaGiftsButton = Button('btn-primary btn-transparent primary', {icon: 'gift_premium', text: 'BoostingGetBoostsViaGifts'});
    attachClickEvent(boostsViaGiftsButton, () => {
      PopupElement.createPopup(PopupBoostsViaGifts, this.peerId);
    }, {listenerSetter: this.listenerSetter});

    const noBoostersHint = i18n('NoBoostersHint');
    noBoostersHint.classList.add('boosts-no-boosters');

    let tabs: HTMLDivElement, content: HTMLDivElement;

    const MenuTab = (props: {
      key: LangPackKey,
      count: number
    }) => {
      return (
        <div class="menu-horizontal-div-item boosts-users-tab">
          <div class="menu-horizontal-div-item-span">
            {i18n(props.key, [props.count])}
            <i />
          </div>
        </div>
      );
    };

    const ContentTab = (props: {
      list: LoadableList,
      hide: boolean,
      moreKey: LangPackKey
    }) => {
      return (
        <div
          class={classNames('boosts-users-content', !props.list.count && 'is-empty', props.hide && 'hide')}
        >
          {props.list.count ? (
            <>
              {props.list.rendered}
              {props.list.loadMore && createMoreButton(
                props.list.count - props.list.rendered.length,
                (button) => {
                  const toggle = toggleDisability(button, true);
                  const promise = props.list.loadMore();
                  promise.finally(() => toggle());
                },
                this.listenerSetter,
                props.moreKey
              )}
            </>
          ) : noBoostersHint}
        </div>
      );
    };

    const [tab, setTab] = createSignal(0);
    const [prepaidGiveaways, setPrepaidGiveaways] = createSignal(boostsStatus.prepaid_giveaways?.slice() || [], {equals: false});
    const onlyGiftedBoosts = createMemo(() => boostsStatus.gift_boosts === boostsStatus.boosts);
    const showGifts = createMemo(() => !onlyGiftedBoosts() && !!giftsBoostsList().count);

    const ret = (
      <>
        <Section>
          {limitLine.container}
          <StatisticsOverviewItems items={[{
            title: 'BoostsLevel2',
            value: makeAbsStats(boostsStatus.level),
            includeZeroValue: true
          }, {
            title: 'PremiumSubscribers',
            value: boostsStatus.premium_audience,
            includeZeroValue: true,
            describePercentage: true
          }, {
            title: 'BoostsExisting',
            value: makeAbsStats(boostsStatus.boosts),
            includeZeroValue: true
          }, {
            title: 'BoostsToLevel',
            value: makeAbsStats(boostsStatus.next_level_boosts - boostsStatus.boosts)
          }]} />
        </Section>
        {this.canCreateGiveaway && prepaidGiveaways().length && (
          <Section name="Giveaway.Prepaid" nameArgs={[1]} caption="BoostingSelectPaidGiveaway">
            <For each={prepaidGiveaways()}>{(prepaidGiveaway) => {
              return (
                <CPrepaidGiveaway
                  giveaway={prepaidGiveaway}
                  appConfig={appConfig}
                  clickable={() => {
                    PopupElement.createPopup(
                      PopupBoostsViaGifts,
                      this.peerId,
                      prepaidGiveaway,
                      () => {
                        setPrepaidGiveaways((giveaways) => {
                          indexOfAndSplice(giveaways, prepaidGiveaway);
                          return giveaways;
                        });
                      }
                    );
                  }}
                  listenerSetter={this.listenerSetter}
                />
              );
            }}</For>
          </Section>
        )}
        <Section class="boosts-users-container">
          <div ref={tabs} class="menu-horizontal-div boosts-users-tabs">
            <MenuTab key="BoostingBoostsCount" count={boostsList().count} />
            {showGifts() && <MenuTab key="BoostingGiftsCount" count={giftsBoostsList().count} />}
          </div>
          <div ref={content} class="boosts-users-contents" onClick={async(e) => {
            const target = findUpClassName(e.target, 'row');
            const boost = this.targets.get(target);
            if(!boost) {
              return;
            }

            if(boost.stars) {
              PopupPayment.create({
                noPaymentForm: true,
                transaction: {
                  _: 'starsTransaction',
                  date: boost.date,
                  id: '',
                  peer: {
                    _: 'starsTransactionPeer',
                    peer: {
                      _: 'peerChannel',
                      channel_id: this.peerId.toChatId()
                    }
                  },
                  pFlags: {},
                  stars: formatStarsAmount(boost.stars),
                  giveaway_post_id: boost.giveaway_msg_id
                },
                boost
              });
              return;
            }

            const slug = boost.used_gift_slug;
            const peerId = boost.user_id?.toPeerId(false);
            if(peerId && !boost.pFlags.gift && !boost.pFlags.unclaimed && !boost.pFlags.giveaway) {
              appImManager.setInnerPeer({peerId: boost.user_id.toPeerId(false)});
            } else if(peerId && peerId !== rootScope.myId) {
              PopupElement.createPopup(
                PopupGiftLink,
                slug,
                undefined,
                {
                  _: 'payments.checkedGiftCode',
                  chats: [],
                  date: boost.date,
                  months: getBoostMonths(boost.date, boost.expires),
                  pFlags: {via_giveaway: boost.pFlags.giveaway || undefined},
                  users: [],
                  from_id: await this.managers.appPeersManager.getOutputPeer(this.peerId),
                  giveaway_msg_id: boost.giveaway_msg_id,
                  slug,
                  to_id: peerId.toUserId(),
                  used_date: slug ? 1 : undefined
                }
              );
            } else if(slug) {
              PopupElement.createPopup(PopupGiftLink, slug);
            } else {
              toastNew({langPackKey: 'BoostingRecipientWillBeSelected'});
            }
          }}>
            <ContentTab list={boostsList()} hide={tab() !== 0} moreKey="BoostingShowMoreBoosts" />
            {showGifts() && <ContentTab list={giftsBoostsList()} hide={tab() !== 1} moreKey="BoostingShowMoreGifts" />}
          </div>
        </Section>
        <Section name="LinkForBoosting" caption="BoostingShareThisLink">
          {inviteLink.container}
        </Section>
        {this.canCreateGiveaway && (
          <Section caption="BoostingGetMoreBoosts">
            {boostsViaGiftsButton}
          </Section>
        )}
      </>
    );

    const selectTab = horizontalMenu(tabs, content, (index) => {
      setTab(index);
    }, undefined, undefined, undefined, this.listenerSetter);
    selectTab(tab());

    return ret;
  }

  private renderBoost = async(boost: Boost) => {
    const boosts = 1 * (boost.multiplier || 1);
    const months = getBoostMonths(boost.date, boost.expires);
    let peerId = boost.user_id?.toPeerId(false);
    if(peerId === rootScope.myId && boost.pFlags.unclaimed) {
      peerId = undefined;
    }

    let badge: HTMLElement;
    if(boosts > 1) {
      badge = document.createElement('span');
      badge.classList.add('boosts-user-boosts', 'boosts-user-badge');
      badge.append(Icon('boost'), ` ${boosts}`);
    }

    let title: HTMLElement;
    if(peerId) {
      title = await wrapPeerTitle({peerId});
      title.classList.add('boosts-user-name');
    } else if(boost.stars) {
      title = i18n('Stars', [boost.stars]);
    } else {
      title = i18n(boost.pFlags.unclaimed ? 'BoostingUnclaimed' : 'BoostingToBeDistributed');
    }

    let subtitle: HTMLElement;
    if(peerId || boost.stars) {
      subtitle = i18n('BoostsExpiration', [boosts, formatFullSentTime(boost.expires, undefined, true)]);
    } else {
      subtitle = document.createElement('span');
      subtitle.append(
        ...joinElementsWith([
          i18n('BoostingShortMonths', [months]),
          formatFullSentTime(boost.expires, undefined, true)
        ], ' • ')
      );
    }

    let rightContent: HTMLElement;
    if(boost.pFlags.giveaway || boost.pFlags.gift) {
      rightContent = document.createElement('span');
      rightContent.classList.add('boosts-user-badge-right', 'boosts-user-badge');
      rightContent.append(
        Icon(boost.pFlags.giveaway ? 'gift_premium' : 'gift'),
        i18n(boost.pFlags.giveaway ? 'BoostingGiveaway' : 'BoostingGift')
      );

      rightContent.classList.toggle('is-gift', !boost.pFlags.giveaway && !!boost.pFlags.gift);
    }

    const row = new Row({
      title: true,
      subtitle,
      clickable: true,
      noWrap: true,
      rightContent
    });

    if(peerId) {
      row.container.dataset.peerId = '' + peerId;
    }

    row.title.classList.add('boosts-user-title');
    row.title.append(...[title, badge].filter(Boolean));
    const media = row.createMedia('abitbigger');
    const avatar = avatarNew({
      peerId,
      size: 42,
      middleware: this.middlewareHelper.get()
    });
    media.append(avatar.node);

    if(peerId) {
      await avatar.readyThumbPromise;
    } else if(boost.stars) {
      avatar.set({
        icon: 'star',
        color: 'stars'
      });
    } else {
      avatar.set({
        icon: boost.pFlags.unclaimed ? 'deleteuser' : 'noncontacts',
        color: getColorByMonths(months)
      });
    }

    this.targets.set(row.container, boost);
    return row.container;
  };

  public async init(peerId: PeerId) {
    this.container.classList.add('boosts-container');

    this.peerId = peerId;
    this.targets = new Map();

    this.setTitle('Boosts');

    const createLoader = (gifts?: boolean) => {
      const middleware = this.middlewareHelper.get();
      let offset = '', isFirst = true;
      const loadMore = async() => {
        const limit = isFirst ? 20 : 100;
        isFirst = false;
        const boostsList = await this.managers.appBoostsManager.getBoostsList({peerId, offset, limit, gifts});
        if(!middleware()) return;

        const promises = boostsList.boosts.map(this.renderBoost);
        const rendered = await Promise.all(promises);

        setF((value) => {
          value.count = boostsList.count;
          offset = boostsList.next_offset;
          if(!offset) {
            value.loadMore = undefined;
          }

          value.rendered.push(...rendered);
          return value;
        });
      };

      const [f, setF] = createLoadableList({loadMore});
      return f;
    };

    const [boostsList, giftsBoostsList] = createRoot((dispose) => {
      const middleware = this.middlewareHelper.get();
      middleware.onDestroy(dispose);
      return [createLoader(false), createLoader(true)]
    });

    const [boostsStatus, appConfig, _, __, canCreateGiveaway] = await Promise.all([
      this.managers.appBoostsManager.getBoostsStatus(peerId),
      this.managers.apiManager.getAppConfig(),
      boostsList().loadMore(),
      giftsBoostsList().loadMore(),
      this.managers.appChatsManager.hasRights(peerId.toChatId(), 'create_giveaway')
    ]);

    this.canCreateGiveaway = canCreateGiveaway;

    const div = document.createElement('div');
    this.scrollable.append(div);
    const dispose = render(() => this._construct(boostsStatus, appConfig, boostsList, giftsBoostsList), div);
    this.eventListener.addEventListener('destroy', dispose);
  }
}
