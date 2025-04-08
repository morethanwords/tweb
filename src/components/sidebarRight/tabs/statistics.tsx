/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type TChart from '../../../lib/tchart/chart';
import type {TChartData, TChatOriginalData} from '../../../lib/tchart/types';
import {Message, MessagesMessages, PostInteractionCounters, PublicForward, StatsAbsValueAndPrev, StatsBroadcastStats, StatsGraph, StatsGroupTopAdmin, StatsGroupTopInviter, StatsGroupTopPoster, StatsMegagroupStats, StatsMessageStats, StatsPercentValue, StatsPublicForwards, StatsStoryStats, StoryItem} from '../../../layer';
import I18n, {LangPackKey, i18n, join, joinElementsWith} from '../../../lib/langPack';
import Section from '../../section';
import {SliderSuperTabEventable} from '../../sliderTab';
import {For, render} from 'solid-js/web';
import {Accessor, JSX, createEffect, createRoot, createSignal, onMount} from 'solid-js';
import formatNumber from '../../../helpers/number/formatNumber';
import {FontFamily} from '../../../config/font';
import {DcId, PickByType} from '../../../types';
import rootScope from '../../../lib/rootScope';
import customProperties from '../../../helpers/dom/customProperties';
import {hexToRgb, mixColors} from '../../../helpers/color';
import emptyPlaceholder from '../../emptyPlaceholder';
import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import liteMode from '../../../helpers/liteMode';
import classNames from '../../../helpers/string/classNames';
import Icon from '../../icon';
import indexOfAndSplice from '../../../helpers/array/indexOfAndSplice';
import Row from '../../row';
import {wrapReplyDivAndCaption} from '../../chat/replyContainer';
import {formatFullSentTime} from '../../../helpers/date';
import numberThousandSplitter from '../../../helpers/number/numberThousandSplitter';
import {wrapStoryMedia} from '../../stories/preview';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import Button from '../../button';
import themeController from '../../../helpers/themeController';
import assumeType from '../../../helpers/assumeType';
import getChatMembersString from '../../wrappers/getChatMembersString';
import createContextMenu from '../../../helpers/dom/createContextMenu';
import appImManager from '../../../lib/appManagers/appImManager';
import {createStoriesViewerWithPeer} from '../../stories/viewer';
import getPeerId from '../../../lib/appManagers/utils/peers/getPeerId';
import {avatarNew} from '../../avatarNew';
import wrapPeerTitle from '../../wrappers/peerTitle';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import ListenerSetter from '../../../helpers/listenerSetter';

const CHANNEL_GRAPHS_TITLES: {[key in keyof PickByType<StatsBroadcastStats, StatsGraph>]: LangPackKey} = {
  growth_graph: 'GrowthChartTitle',
  followers_graph: 'FollowersChartTitle',
  mute_graph: 'Notifications',
  top_hours_graph: 'TopHoursChartTitle',
  views_by_source_graph: 'ViewsBySourceChartTitle',
  new_followers_by_source_graph: 'NewFollowersBySourceChartTitle',
  languages_graph: 'LanguagesChartTitle',
  interactions_graph: 'InteractionsChartTitle',
  iv_interactions_graph: 'IVInteractionsChartTitle',
  reactions_by_emotion_graph: 'ReactionsByEmotionChartTitle',
  story_interactions_graph: 'StoryInteractionsChartTitle',
  story_reactions_by_emotion_graph: 'StoryReactionsByEmotionChartTitle'
};

const GROUP_GRAPH_TITLES: {[key in keyof PickByType<StatsMegagroupStats, StatsGraph>]: LangPackKey} = {
  growth_graph: 'GrowthChartTitle',
  members_graph: 'GroupMembersChartTitle',
  new_members_by_source_graph: 'NewMembersBySourceChartTitle',
  languages_graph: 'MembersLanguageChartTitle',
  messages_graph: 'MessagesChartTitle',
  actions_graph: 'ActionsChartTitle',
  top_hours_graph: 'TopHoursChartTitle',
  weekdays_graph: 'TopDaysOfWeekChartTitle'
};

const MESSAGE_GRAPH_TITLES: {[key in keyof PickByType<StatsMessageStats, StatsGraph>]: LangPackKey} = {
  views_graph: 'ViewsAndSharesChartTitle',
  reactions_by_emotion_graph: 'ReactionsByEmotionChartTitle'
};

const STORY_GRAPH_TITLES = MESSAGE_GRAPH_TITLES;

const CHANNEL_OVERVIEW_ITEMS: {[key in keyof PickByType<StatsBroadcastStats, StatsAbsValueAndPrev | StatsPercentValue>]: LangPackKey} = {
  followers: 'FollowersChartTitle',
  enabled_notifications: 'EnabledNotifications',
  views_per_post: 'ViewsPerPost',
  views_per_story: 'ViewsPerStory',
  shares_per_post: 'SharesPerPost',
  shares_per_story: 'SharesPerStory',
  reactions_per_post: 'ReactionsPerPost',
  reactions_per_story: 'ReactionsPerStory'
};

const GROUP_OVERVIEW_ITEMS: {[key in keyof PickByType<StatsMegagroupStats, StatsAbsValueAndPrev | StatsPercentValue>]: LangPackKey} = {
  members: 'MembersOverviewTitle',
  messages: 'MessagesOverview',
  viewers: 'ViewingMembers',
  posters: 'PostingMembers'
};

const MESSAGE_OVERVIEW_ITEMS: {[key in keyof PickByType<StatsMessageStats, StatsAbsValueAndPrev | StatsPercentValue>]: LangPackKey} = {
  views: 'StatisticViews',
  public_shares: 'PublicShares',
  reactions: 'Reactions',
  private_shares: 'PrivateShares'
};

const STORY_OVERVIEW_ITEMS = MESSAGE_OVERVIEW_ITEMS;

let TChartPromise: Promise<any>;
let _TChart: typeof TChart;
function ensureTChart() {
  return TChartPromise ??= import('../../../lib/tchart/chart').then((module) => {
    _TChart = module.default;
  });
}

function extractColor(color: string): string {
  return color.substring(color.indexOf('#'));
}

export const makeAbsStats = (value: number, approximate?: boolean): StatsAbsValueAndPrev => {
  return {
    _: 'statsAbsValueAndPrev',
    current: value,
    previous: 0,
    approximate
  };
};

export type LoadableList<T extends any = any> = {rendered: (HTMLElement | JSX.Element)[], values: T[], left: number, count: number, loadMore?: () => Promise<void>};
export const createLoadableList = <T extends any = any>(props: Partial<LoadableList<T>> = {}) => {
  return createSignal<LoadableList<T>>({
    rendered: [],
    values: [],
    left: 0,
    count: 0,
    ...props
  }, {equals: false});
};

export const createMoreButton = (
  count: number,
  callback: (button: HTMLElement) => any,
  listenerSetter: ListenerSetter,
  key: LangPackKey = 'PollResults.LoadMore'
) => {
  const button = Button('btn btn-primary btn-transparent primary', {icon: 'down', text: key, textArgs: [count]});
  attachClickEvent(button, () => {
    callback(button);
  }, {listenerSetter});
  return button;
};

const StatisticsOverviewItem = ({
  value,
  title,
  includeZeroValue,
  describePercentage
}: {
  value: StatsAbsValueAndPrev | StatsPercentValue,
  title: LangPackKey,
  includeZeroValue?: boolean,
  describePercentage?: boolean
}) => {
  const isPercentage = value._ === 'statsPercentValue';
  let v: JSX.Element;
  if(isPercentage) {
    const n = (value.part / value.total * 100).toFixed(2);
    v = `${n}%`;

    if(describePercentage) {
      v = (
        <>
          {`≈${value.part} `}
          <span class="statistics-overview-item-value-description">
            {v}
          </span>
        </>
      );
    }
  } else {
    v = formatNumber(value.current, 1);

    if(value.approximate) {
      v = '≈' + v;
    }

    if(!value.current && !value.previous && !includeZeroValue) {
      return;
    }

    if(value.current !== value.previous && value.previous) {
      const diff = value.current - value.previous;
      const absDiff = Math.abs(diff);
      const vv = `${diff > 0 ? '+' : '-'}${formatNumber(absDiff, 1)}`;
      const p = +(Math.abs(1 - value.current / value.previous) * 100).toFixed(2);
      const str = `${vv} (${p}%)`;
      v = (
        <>
          {v}{' '}
          <span
            class={classNames('statistics-overview-item-value-description', diff > 0 ? 'green' : 'red')}
          >
            {str}
          </span>
        </>
      );
    }
  }

  return (
    <div class="statistics-overview-item">
      <div class="statistics-overview-item-value">
        {v}
      </div>
      <div class="statistics-overview-item-name">
        {i18n(title)}
      </div>
    </div>
  );
};

export const StatisticsOverviewItems = (props: {
  items: Parameters<typeof StatisticsOverviewItem>[0][]
}) => {
  return (
    <div class="statistics-overview">
      <For each={props.items}>{StatisticsOverviewItem}</For>
    </div>
  );
};

export default class AppStatisticsTab extends SliderSuperTabEventable {
  private chatId: ChatId;
  private mid: number;
  private storyId: number;
  private stats: StatsBroadcastStats | StatsMegagroupStats | StatsMessageStats | StatsStoryStats;
  private messages: Map<number, Message.message>;
  private stories: Map<number, StoryItem.storyItem>;
  private dcId: DcId;
  private openPromise: CancellablePromise<void>;
  private isBroadcast: boolean;
  private isMegagroup: boolean;
  private isMessage: boolean;
  private isStory: boolean;

  protected onOpenAfterTimeout(): void {
    this.openPromise.resolve();
  }

  private _construct(
    recentPosts: {container: HTMLElement, postInteractionCounters: PostInteractionCounters}[],
    topPosters: {container: HTMLElement, peerId: PeerId}[],
    topAdmins: {container: HTMLElement, peerId: PeerId}[],
    topInviters: {container: HTMLElement, peerId: PeerId}[],
    publicForwards: Accessor<LoadableList>,
    currentPost: (typeof recentPosts)[0]
  ) {
    const dateElement = new I18n.IntlDateElement({options: {}});
    const getLabelDate: TChartData['getLabelDate'] = (value, options = {}) => {
      options.displayYear ??= true;
      options.isMonthShort ??= true;

      const date = new Date(value);
      dateElement.update({
        date,
        options: {
          weekday: options.displayWeekDay ? options.isShort ? 'short' : 'long' : undefined,
          year: options.displayYear ? 'numeric' : undefined,
          hour: options.displayHours ? '2-digit' : undefined,
          minute: options.displayHours ? '2-digit' : undefined,
          month: options.isMonthShort ? 'short' : 'long',
          day: 'numeric'
        }
      });

      return dateElement.element.textContent;
    };

    const getLabelTime: TChartData['getLabelTime'] = (value: number) => {
      const date = new Date(value);
      dateElement.update({
        date,
        options: {
          hour: '2-digit',
          minute: '2-digit'
        }
      });

      return dateElement.element.textContent;
    };

    const makeColors = () => {
      const surface = customProperties.getProperty('surface-color');
      const primary = customProperties.getProperty('primary-color');
      const secondary = customProperties.getProperty('secondary-color');
      const surfaceRgb = hexToRgb(surface);

      const miniMask = mixColors(
        hexToRgb(secondary),
        mixColors(
          hexToRgb(primary),
          surfaceRgb,
          0.1
        ),
        0.2
      );

      const miniFrame = mixColors(
        hexToRgb(secondary),
        mixColors(
          hexToRgb(primary),
          surfaceRgb,
          0.3
        ),
        0.4
      );

      const colors: ConstructorParameters<typeof TChart>[0]['settings']['COLORS'] = {
        primary: customProperties.getProperty('primary-color'),
        secondary: customProperties.getProperty('secondary-color'),
        background: surface,
        backgroundRgb: surfaceRgb,
        text: customProperties.getProperty('primary-text-color'),
        dates: customProperties.getProperty('secondary-text-color'),
        grid: `rgba(${hexToRgb(customProperties.getProperty('secondary-text-color')).join(', ')}, 0.2)`,
        axis: {
          x: customProperties.getProperty('secondary-text-color'),
          y: customProperties.getProperty('secondary-text-color')
        },
        barsSelectionBackground: `rgba(${surfaceRgb.join(', ')}, 0.5)`,
        miniMask: `rgba(${miniMask.join(', ')}, 0.6)`,
        miniFrame: `rgb(${miniFrame.join(', ')})`
      };

      return colors;
    };
    let colors = makeColors();
    this.listenerSetter.add(rootScope)('theme_changed', () => {
      colors = makeColors();
    });

    const titles = this.isBroadcast ? CHANNEL_GRAPHS_TITLES : (this.isMegagroup ? GROUP_GRAPH_TITLES : (this.isStory ? STORY_GRAPH_TITLES : MESSAGE_GRAPH_TITLES));
    const graphs: {statsGraph: StatsGraph.statsGraph, title: LangPackKey, percentage: boolean}[] = Object.keys(titles).map((key) => {
      const statsGraph = this.stats[key as keyof typeof titles];
      return statsGraph && {
        statsGraph,
        title: titles[key as keyof typeof titles],
        percentage: (key as keyof typeof titles) === 'languages_graph'
      };
    }).filter(Boolean);
    const renderGraph = ({statsGraph, title, percentage}: typeof graphs[0]) => {
      onMount(() => {
        let data: TChatOriginalData = JSON.parse(statsGraph.json.data);
        // console.log('data', JSON.parse(statsGraph.json.data));

        const prepareData = (data: TChatOriginalData, percentage?: boolean) => {
          for(const i in data.colors) {
            const color = data.colors[i];
            data.colors[i] = extractColor(color);
          }

          if(percentage) for(const i in data.types) {
            if(data.types[i] === 'bar') {
              data.types[i] = 'area';
            }
          }

          return data;
        };

        data = prepareData(data, percentage);

        type T = ConstructorParameters<typeof TChart>[0]['data'];
        const addOptions: Partial<T> = {
          getLabelDate,
          getLabelTime,
          tooltipOnHover: true
        };

        const zoomToken = statsGraph.zoom_token;
        const tChart = _TChart.render({
          container,
          data: {
            ...data,
            ...addOptions,
            x_on_zoom: zoomToken ? async(x) => {
              const statsGraph = await this.managers.appStatisticsManager.loadAsyncGraph(zoomToken, x, this.dcId);
              if(statsGraph._ === 'statsGraphError') {
                return;
              }

              // console.log('zoom data', JSON.parse((statsGraph as StatsGraph.statsGraph).json.data));

              return {
                ...prepareData(JSON.parse((statsGraph as StatsGraph.statsGraph).json.data), percentage),
                ...addOptions
              };
            } : undefined
          } as T,
          settings: {
            darkMode: themeController.isNight(),
            ALL_LABEL: I18n.format('Chart.Tooltip.All', true),
            DATES_SIDE: 'left',
            DATES_WEIGHT: 'normal',
            DATES_FONT_SIZE: 14,
            ZOOM_TEXT: I18n.format('ZoomOut', true),
            FONT: {
              family: FontFamily,
              bold: '500',
              normal: '400'
            },
            COLORS: colors
          }
        });

        const setStyles = () => {
          const p: [property: string, value: string][] = [
            ['primary-color', colors.primary],
            ['background-color', colors.background],
            ['background-color-rgb', colors.backgroundRgb.join(', ')],
            ['text-color', colors.text],
            ['secondary-color', colors.secondary],
            ['font-family', FontFamily]
          ];

          p.forEach(([property, value]) => {
            tChart.$wrapper.style.setProperty(`--tchart-${property}`, value);
          });
        };

        setStyles();

        this.listenerSetter.add(rootScope)('theme_changed', () => {
          tChart.setDarkMode(themeController.isNight(), {...colors});
          setStyles();
        });
      });

      const titleElement = document.createElement('div');
      const captionElement = document.createElement('div');
      titleElement.classList.add('statistics-title');
      const t = i18n(title);
      t.classList.add('statistics-title-text');
      titleElement.append(t);
      // let zoomOutElement: HTMLElement;
      // if(graph.zoomToken || graph.isPercentage) {
      //   zoomOutElement = document.createElement('div');
      //   zoomOutElement.classList.add('statistics-title-zoom');
      //   zoomOutElement.append(Icon('zoomout', 'statistics-title-zoom-icon'), i18n('ZoomOut'));
      //   titleElement.append(zoomOutElement);
      // }
      let container: HTMLDivElement;
      return (
        <Section name={titleElement} nameRight={captionElement}>
          <div class="statistics-chart" ref={container}></div>
        </Section>
      );
    };

    const overviewTitles = this.stats._ === 'stats.broadcastStats' ? CHANNEL_OVERVIEW_ITEMS : (this.isMegagroup ? GROUP_OVERVIEW_ITEMS : (this.isStory ? STORY_OVERVIEW_ITEMS : MESSAGE_OVERVIEW_ITEMS));
    const overviewItems: {value: StatsAbsValueAndPrev | StatsPercentValue, title: LangPackKey}[] = Object.keys(overviewTitles).map((key) => {
      const value = this.stats[key as keyof typeof overviewTitles];
      return value && {
        value,
        title: overviewTitles[key as keyof typeof overviewTitles]
      };
    }).filter(Boolean);

    const formatDateRange = (min: number, max: number) => {
      return joinElementsWith([min, max].map((timestamp) => {
        return new I18n.IntlDateElement({
          date: new Date(timestamp * 1e3),
          options: {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }
        }).element;
      }), ' — ');
    };

    const period = (this.stats as StatsBroadcastStats).period;
    const topPeersTitles: [LangPackKey, LangPackKey, LangPackKey] = ['TopMembers', 'TopAdmins', 'TopInviters'];
    let postsContainer: HTMLDivElement;
    const ret = (
      <>
        {currentPost && <Section>{currentPost.container}</Section>}
        <Section name="StatisticOverview" nameRight={period && formatDateRange(period.min_date, period.max_date)}>
          <StatisticsOverviewItems items={overviewItems} />
        </Section>
        <For each={graphs}>{renderGraph}</For>
        {recentPosts.length && <Section ref={postsContainer} name="RecentPosts">
          {recentPosts.map(({container}) => container)}
        </Section>}
        <For each={[topPosters, topAdmins, topInviters]}>{(topPeers, idx) => {
          if(!topPeers.length) {
            return;
          }

          topPeers = topPeers.slice();

          const chatlist = appDialogsManager.createChatList();
          chatlist.append(...topPeers.splice(0, 10).map(({container}) => container));
          let moreButton: HTMLElement;
          if(topPeers.length) {
            moreButton = createMoreButton(topPeers.length, () => {
              moreButton.remove();
              chatlist.append(...topPeers.map(({container}) => container));
            }, this.listenerSetter);
          }
          return (
            <Section name={topPeersTitles[idx()]} nameRight={period && formatDateRange(period.min_date, period.max_date)}>
              {chatlist}
              {moreButton}
            </Section>
          );
        }}</For>
        {publicForwards().count && <Section name="PublicSharesCount" nameArgs={[publicForwards().count]}>
          <div
            ref={(el) => {
              appDialogsManager.setListClickListener({
                list: el,
                onFound: (target) => {
                  const storyId = target.dataset.storyId;
                  if(storyId) {
                    createStoriesViewerWithPeer({
                      target: () => target.querySelector('.avatar'),
                      peerId: target.dataset.peerId.toPeerId(),
                      id: +target.dataset.storyId
                    });
                    return false;
                  }
                },
                withContext: undefined,
                autonomous: undefined,
                openInner: true
              });
            }}
          >
            {publicForwards().rendered}
          </div>
          {publicForwards().loadMore && createMoreButton(
            publicForwards().count - publicForwards().rendered.length,
            (button) => {
              const toggle = toggleDisability(button, true);
              const promise = publicForwards().loadMore();
              promise.finally(() => toggle());
            },
            this.listenerSetter
          )}
        </Section>}
      </>
    );

    if(postsContainer) {
      const map: Map<HTMLElement, PostInteractionCounters> = new Map();
      recentPosts.forEach(({container, postInteractionCounters}) => {
        map.set(container, postInteractionCounters);
      });

      const findTarget = (e: MouseEvent | TouchEvent) => findUpClassName(e.target, 'statistics-post');
      let counters: PostInteractionCounters;

      const onOpenClick = () => {
        this.slider.createTab(AppStatisticsTab).open(
          this.chatId,
          (counters as PostInteractionCounters.postInteractionCountersMessage).msg_id,
          (counters as PostInteractionCounters.postInteractionCountersStory).story_id
        );
      };

      attachClickEvent(postsContainer, (e) => {
        counters = map.get(findTarget(e));
        if(!counters) {
          return;
        }

        onOpenClick();
      }, {listenerSetter: this.listenerSetter});

      createContextMenu({
        buttons: [{
          icon: 'statistics',
          text: 'ViewStatistics',
          onClick: onOpenClick
        }, {
          icon: 'message',
          text: 'Message.Context.Goto',
          onClick: () => {
            appImManager.setInnerPeer({
              peerId: this.chatId.toPeerId(true),
              lastMsgId: (counters as PostInteractionCounters.postInteractionCountersMessage).msg_id
            });
          },
          verify: () => counters._ === 'postInteractionCountersMessage'
        }, {
          icon: 'stories',
          text: 'ViewStory',
          onClick: () => {
            createStoriesViewerWithPeer({
              peerId: this.chatId.toPeerId(true),
              id: (counters as PostInteractionCounters.postInteractionCountersStory).story_id
            });
          },
          verify: () => counters._ === 'postInteractionCountersStory'
        }],
        listenTo: postsContainer,
        listenerSetter: this.listenerSetter,
        findElement: (e) => {
          const target = findTarget(e);
          counters = map.get(target);
          return target;
        },
        middleware: this.middlewareHelper.get()
      });
    }

    return ret;
  }

  private async renderRecentPost(
    postInteractionCounters: PostInteractionCounters,
    peerId: PeerId = this.chatId.toPeerId(true),
    message?: Message.message,
    storyItem?: StoryItem.storyItem,
    noLabels?: boolean
  ) {
    const subtitleRightFragment = document.createDocumentFragment();
    const a: [Icon, number][] = [
      ['reactions', postInteractionCounters.reactions],
      ['reply', postInteractionCounters.forwards]
    ];

    !noLabels && a.forEach(([icon, count]) => {
      if(!count) {
        return;
      }

      const i = Icon(icon, 'statistics-post-counter-icon');
      if(icon === 'reply') {
        i.classList.add('icon-reflect');
      }

      const e = document.createElement('span');
      e.classList.add('statistics-post-counter');
      e.append(i, formatNumber(count, 1));
      subtitleRightFragment.append(e);
    });

    const row = new Row({
      title: true,
      titleRight: noLabels ? undefined : i18n('Views', [numberThousandSplitter(postInteractionCounters.views)]),
      subtitle: true,
      subtitleRight: noLabels ? undefined : subtitleRightFragment,
      clickable: true,
      noWrap: true,
      asLink: !!(message || storyItem)
    });

    const {container} = row;
    container.classList.add('statistics-post');

    row.title.classList.add('statistics-post-title');

    const middleware = this.middlewareHelper.get();
    const mediaEl = document.createElement('div');
    mediaEl.classList.add('statistics-post-media');
    if(message || storyItem) {
      const {node, readyThumbPromise, setStoriesSegments} = avatarNew({
        middleware,
        size: 42,
        isDialog: true,
        peerId
      });

      row.container.dataset.peerId = '' + peerId;
      if(storyItem) {
        setStoriesSegments([{length: 1, type: 'unread'}]);
        row.container.dataset.storyId = '' + storyItem.id;
      } else {
        row.container.dataset.mid = '' + message.mid;
      }

      mediaEl.append(node);
      await readyThumbPromise;
      row.title.append(await wrapPeerTitle({peerId}));
      row.subtitle.append(formatFullSentTime(message?.date || storyItem?.date));
      row.applyMediaElement(mediaEl, 'abitbigger');
    } else if(postInteractionCounters._ === 'postInteractionCountersMessage') {
      container.classList.add('statistics-post-message');
      message ||= this.messages.get(postInteractionCounters.msg_id);
      const isMediaSet = await wrapReplyDivAndCaption({
        titleEl: row.subtitle,
        title: formatFullSentTime(message.date),
        subtitleEl: row.title,
        message,
        mediaEl,
        middleware,
        withoutMediaType: true
      });

      if(!isMediaSet) {
        const {node, readyThumbPromise} = avatarNew({middleware, peerId, size: 42});
        mediaEl.append(node);
        await readyThumbPromise;
      }

      row.applyMediaElement(mediaEl, 'abitbigger');
    } else {
      container.classList.add('statistics-post-story');
      storyItem ||= this.stories.get(postInteractionCounters.story_id);
      row.title.append(i18n('Story'));
      row.subtitle.append(formatFullSentTime(storyItem.date));

      const border = document.createElement('div');
      border.classList.add('avatar-stories-simple', 'is-unread');
      mediaEl.append(border);

      await createRoot((dispose) => {
        middleware.onDestroy(dispose);
        const {ready, div} = wrapStoryMedia({
          storyItem,
          peerId: this.chatId.toPeerId(true),
          forPreview: true,
          noInfo: true,
          withPreloader: false,
          noAspecter: true
        });

        const deferred = deferredPromise<void>();

        createEffect(() => {
          if(ready()) {
            mediaEl.append(div);
            deferred.resolve();
          }
        });

        return deferred;
      });

      row.applyMediaElement(mediaEl, 'abitbigger');
    }

    return {container, postInteractionCounters};
  }

  private renderPeer = async(peer: StatsGroupTopPoster | StatsGroupTopAdmin | StatsGroupTopInviter | Message.message) => {
    const peerId = peer._ === 'message' ? peer.peerId : peer.user_id.toPeerId(false);
    const loadPromises: Promise<any>[] = [];
    const {dom} = appDialogsManager.addDialogNew({
      peerId: peerId,
      container: false,
      rippleEnabled: true,
      avatarSize: 'abitbigger',
      loadPromises,
      wrapOptions: {
        middleware: this.middlewareHelper.get()
      },
      meAsSaved: false
    });

    let toJoin: Node[];
    if(peer._ === 'message') {
      toJoin = [
        await getChatMembersString(peerId.toChatId()),
        i18n('Views', [formatNumber(peer.views, 1)])
      ];
      dom.listEl.dataset.mid = '' + peer.mid;
    } else if(peer._ === 'statsGroupTopPoster') {
      toJoin = [
        peer.messages && i18n('messages', [peer.messages]),
        peer.avg_chars && i18n('CharactersPerMessage', [i18n('Characters', [peer.avg_chars])])
      ];
    } else if(peer._ === 'statsGroupTopAdmin') {
      toJoin = [
        peer.deleted && i18n('Deletions', [peer.deleted]),
        peer.banned && i18n('Bans', [peer.banned]),
        peer.kicked && i18n('Restrictions', [peer.kicked])
      ];
    } else {
      toJoin = [
        peer.invitations && i18n('Invitations', [peer.invitations])
      ];
    }

    toJoin = toJoin.filter(Boolean);
    if(toJoin.length) {
      dom.lastMessageSpan.replaceChildren(...join(toJoin, false));
    }

    await Promise.all(loadPromises);
    return {container: dom.listEl, peerId};
  };

  private renderPublicForward = async(publicForward: PublicForward) => {
    if(publicForward._ === 'publicForwardMessage') {
      const message = publicForward.message as Message.message;
      return this.renderRecentPost({
        _: 'postInteractionCountersMessage',
        forwards: message.forwards,
        msg_id: message.mid,
        views: message.views,
        reactions: message.reactions ? message.reactions.results.reduce((acc, v) => acc + v.count, 0) : 0
      }, message.peerId, message);
    }

    const storyItem = publicForward.story as StoryItem.storyItem;
    if(!storyItem) {
      return;
    }

    const storyViews = storyItem.views;
    return this.renderRecentPost({
      _: 'postInteractionCountersStory',
      forwards: storyViews?.forwards_count || 0,
      story_id: storyItem.id,
      views: storyViews?.views_count || 0,
      reactions: storyViews?.reactions_count || 0
    }, getPeerId(publicForward.peer), undefined, storyItem);
  };

  private async loadStats() {
    const peerId = this.chatId.toPeerId(true);
    const manager = this.managers.appStatisticsManager;
    const loadLimit = 100;
    const func = this.isBroadcast ? manager.getBroadcastStats : (this.isMegagroup ? manager.getMegagroupStats : (this.isStory ? manager.getStoryStats : manager.getMessageStats));
    const postPromise = this.isMessage ? this.managers.appMessagesManager.reloadMessages(peerId, this.mid) : undefined;
    const postPublicForwardsPromise = this.isMessage ? manager.getMessagePublicForwards({peerId, mid: this.mid, limit: loadLimit}) : undefined;
    const storyPromise = this.isStory ? this.managers.appStoriesManager.getStoryById(peerId, this.storyId) : undefined;
    const storyPublicForwardsPromise = this.isStory ? manager.getStoryPublicForwards({peerId, id: this.storyId, limit: loadLimit}) : undefined;
    const {stats, dcId} = await func({
      peerId,
      dark: themeController.isNight(),
      storyId: this.storyId,
      mid: this.mid
    });
    this.stats = stats;
    this.dcId = dcId;

    const promises: PromiseLike<any>[] = [];
    for(const key in stats) {
      const value = stats[key as keyof typeof stats] as any as StatsGraph;
      if(value._ === 'statsGraphAsync') {
        const promise = manager.loadAsyncGraph(
          value.token,
          undefined,
          dcId
        ).then((statsGraph) => {
          if(statsGraph._ === 'statsGraphError') {
            delete stats[key as keyof typeof stats];
            return;
          }

          stats[key as keyof typeof stats] = statsGraph as any;
        });
        promises.push(promise);
      } else if(value._ === 'statsGraphError') {
        delete stats[key as keyof typeof stats];
      }
    }

    const recentPosts = (stats as StatsBroadcastStats).recent_posts_interactions || [];
    recentPosts.forEach((postInteractionCounters) => {
      let promise: PromiseLike<any>;
      if(postInteractionCounters._ === 'postInteractionCountersMessage') {
        promise = this.managers.appMessagesManager.reloadMessages(peerId, postInteractionCounters.msg_id)
        .then((message) => {
          if(!message) {
            indexOfAndSplice(recentPosts, postInteractionCounters);
            return;
          }

          this.messages.set(message.mid, message as Message.message);
        });
      } else {
        promise = this.managers.appStoriesManager.getStoryById(peerId, postInteractionCounters.story_id)
        .then((storyItem) => {
          if(!storyItem) {
            indexOfAndSplice(recentPosts, postInteractionCounters);
            return;
          }

          this.stories.set(storyItem.id, storyItem);
        });
      }

      promises.push(promise);
    });

    const renderedPublicForwards = Promise.all([
      postPromise,
      postPublicForwardsPromise,
      storyPromise,
      storyPublicForwardsPromise
    ]).then(async([message, messagePublicForwards, storyItem, storyPublicForwards]) => {
      const [f, setF] = createLoadableList();
      if(!message && !storyItem) {
        return f;
      }

      assumeType<StatsMessageStats | StatsStoryStats>(stats);

      if(message) {
        assumeType<Message.message>(message);
        this.messages.set(message.mid, message);
        const totalPublicForwards = messagePublicForwards.count;
        stats.views = makeAbsStats(message.views);
        stats.reactions = makeAbsStats(message.reactions ? message.reactions.results.reduce((acc, v) => acc + v.count, 0) : 0);
        stats.public_shares = makeAbsStats(totalPublicForwards);
        stats.private_shares = makeAbsStats(message.forwards - totalPublicForwards, true);

        setF((value) => (value.count = totalPublicForwards, value));

        let offset: string;
        const r = async(statsPublicForwards: StatsPublicForwards.statsPublicForwards) => {
          offset = statsPublicForwards.next_offset;

          const promises = statsPublicForwards.forwards.map(this.renderPublicForward);
          const rendered = await Promise.all(promises);
          setF((value) => {
            value.rendered.push(...rendered.map(({container}) => container));
            value.loadMore = offset ? () => {
              return manager.getMessagePublicForwards({
                peerId,
                mid: this.mid,
                limit: loadLimit,
                offset
              }).then(r);
            } : undefined;
            return value;
          });
        };

        await r(messagePublicForwards);
      } else {
        const totalPublicForwards = storyPublicForwards.count;
        const storyViews = storyItem.views;
        stats.views = makeAbsStats(storyViews.views_count);
        stats.reactions = makeAbsStats(storyViews.reactions_count || 0);
        stats.public_shares = makeAbsStats(totalPublicForwards);
        stats.private_shares = makeAbsStats(Math.abs((storyViews.forwards_count || 0) - totalPublicForwards), true);

        setF((value) => (value.count = totalPublicForwards, value));

        let offset: string;
        const r = async(statsPublicForwards: StatsPublicForwards.statsPublicForwards) => {
          offset = statsPublicForwards.next_offset;

          const promises = statsPublicForwards.forwards.map(this.renderPublicForward);
          const rendered = await Promise.all(promises);
          setF((value) => {
            value.rendered.push(...rendered.map(({container}) => container));
            value.loadMore = offset ? () => {
              return manager.getStoryPublicForwards({
                peerId,
                id: storyItem.id,
                limit: loadLimit,
                offset
              }).then(r);
            } : undefined;
            return value;
          });
        };

        await r(storyPublicForwards);
      }

      return f;
    });
    promises.push(renderedPublicForwards);

    const topPosters = (stats as StatsMegagroupStats).top_posters || [];
    const topAdmins = (stats as StatsMegagroupStats).top_admins || [];
    const topInvites = (stats as StatsMegagroupStats).top_inviters || [];
    const renderedTopPosters = topPosters.map(this.renderPeer);
    const renderedTopAdmins = topAdmins.map(this.renderPeer);
    const renderedTopInviters = topInvites.map(this.renderPeer);

    return Promise.all(promises).then(() => {
      const recentPostsPromises = recentPosts.map((postInteractionCounters) => {
        return this.renderRecentPost(postInteractionCounters);
      });

      const currentPostPromise = this.isMessage ? this.renderRecentPost({
        _: 'postInteractionCountersMessage',
        msg_id: this.mid,
        forwards: 0,
        reactions: 0,
        views: 0
      }, undefined, undefined, undefined, true) : undefined;

      const promises = [
        Promise.all(recentPostsPromises),
        Promise.all(renderedTopPosters),
        Promise.all(renderedTopAdmins),
        Promise.all(renderedTopInviters),
        renderedPublicForwards,
        currentPostPromise
      ] as const;

      return Promise.all(promises);
    });
  }

  public async init(chatId: ChatId, mid?: number, storyId?: number) {
    this.container.classList.add('statistics-container');

    this.chatId = chatId;
    this.mid = mid;
    this.storyId = storyId;
    this.messages = new Map();
    this.stories = new Map();
    this.openPromise = deferredPromise<void>();

    if(mid) {
      this.isMessage = true;
    } else if(storyId) {
      this.isStory = true;
    } else {
      this.isBroadcast = await this.managers.appChatsManager.isBroadcast(chatId);
      this.isMegagroup = await this.managers.appChatsManager.isMegagroup(chatId);
    }

    this.setTitle(this.isBroadcast ? 'Statistics' : (this.isMegagroup ? 'GroupStats.Title' : (this.isStory ? 'StoryStatistics' : 'PostStatistics')));

    const promise = Promise.all([
      ensureTChart(),
      this.openPromise,
      this.loadStats()
    ]);

    const [hide, setHide] = createSignal(false);

    const element = await emptyPlaceholder({
      title: () => i18n('LoadingStats'),
      description: () => i18n('LoadingStatsDescription'),
      assetName: 'StatsEmoji',
      middleware: this.middlewareHelper.get(),
      hide,
      isFullSize: true
    });

    this.scrollable.append(element);
    promise.then(async([_, __, loaded]) => {
      const div = document.createElement('div');
      this.scrollable.append(div);
      const dispose = render(() => this._construct(...loaded), div);
      this.eventListener.addEventListener('destroy', dispose);

      if(liteMode.isAvailable('animations')) {
        const keyframes: Keyframe[] = [{opacity: '1'}, {opacity: '0'}];
        const options: KeyframeAnimationOptions = {duration: 200, fill: 'forwards', easing: 'ease-in-out'};
        const animations = [
          element.animate(keyframes, options),
          div.animate(keyframes.slice().reverse(), options)
        ];

        await Promise.all(animations.map((animation) => animation.finished));
      }

      setHide(true);
    });
  }
}
