/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Message, PostInteractionCounters, StatsAbsValueAndPrev, StatsBroadcastStats, StatsGraph, StatsGroupTopAdmin, StatsGroupTopInviter, StatsGroupTopPoster, StatsMegagroupStats, StatsPercentValue, StoryItem} from '../../../layer';
import I18n, {LangPackKey, i18n, join, joinElementsWith} from '../../../lib/langPack';
import Section from '../../section';
import {SliderSuperTabEventable} from '../../sliderTab';
import {For, render} from 'solid-js/web';
import {JSX, createEffect, createRoot, createSignal, onMount} from 'solid-js';
import formatNumber from '../../../helpers/number/formatNumber';
import {create} from '../../../lib/lovely-chart/LovelyChart';
import {FontFamily, FontWeight} from '../../../config/font';
import {DcId, PickByType} from '../../../types';
import rootScope from '../../../lib/rootScope';
import customProperties from '../../../helpers/dom/customProperties';
import {hexToRgb, mixColors, rgbaToHexa} from '../../../helpers/color';
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

let lovelyChartPromise: Promise<any>;
let createLovelyChart: typeof create;
function ensureLovelyChart() {
  return lovelyChartPromise ??= import('../../../lib/lovely-chart/LovelyChart').then((module) => {
    createLovelyChart = module.create;
  });
}

export function buildGraph(result: StatsGraph, isPercentage?: boolean) {
  if(result?._ !== 'statsGraph') {
    return;
  }

  const data = JSON.parse(result.json.data);
  const [x, ...y] = data.columns;
  const hasSecondYAxis = data.y_scaled;
  isPercentage ??= !!data.percentage;

  return {
    type: isPercentage ? 'area' : data.types.y0,
    zoomToken: result.zoom_token,
    labelFormatter: data.xTickFormatter,
    tooltipFormatter: data.xTooltipFormatter,
    labels: x.slice(1),
    hideCaption: !data.subchart.show,
    hasSecondYAxis,
    isStacked: data.stacked && !hasSecondYAxis,
    isPercentage,
    datasets: y.map((item: any) => {
      const key = item[0];

      return {
        name: data.names[key],
        color: extractColor(data.colors[key]),
        values: item.slice(1)
      };
    }),
    ...calculateMinimapRange(data.subchart.defaultZoom, x.slice(1))
  };
}

function extractColor(color: string): string {
  return color.substring(color.indexOf('#'));
}

function calculateMinimapRange(range: Array<number>, values: Array<number>) {
  const [min, max] = range;

  let minIndex = 0;
  let maxIndex = values.length - 1;

  values.forEach((item, index) => {
    if(!minIndex && item >= min) {
      minIndex = index;
    }

    if(!maxIndex && item >= max) {
      maxIndex = index;
    }
  });

  const begin = Math.max(0, minIndex / (values.length - 1));
  const end = Math.min(1, maxIndex / (values.length - 1));

  return {minimapRange: {begin, end}, labelFromIndex: minIndex, labelToIndex: maxIndex};
}

export default class AppStatisticsTab extends SliderSuperTabEventable {
  private chatId: ChatId;
  private mid: number;
  private storyId: number;
  private stats: StatsBroadcastStats | StatsMegagroupStats;
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
    topInviters: {container: HTMLElement, peerId: PeerId}[]
  ) {
    const dateElement = new I18n.IntlDateElement({options: {}});
    const getLabelDate: Parameters<typeof createLovelyChart>[1]['getLabelDate'] = (label, options = {}) => {
      options.displayYear ??= true;

      const date = new Date(label.value);
      dateElement.update({
        date,
        options: {
          weekday: options.displayWeekDay ? options.isShort ? 'short' : 'long' : undefined,
          year: options.displayYear ? 'numeric' : undefined,
          hour: options.displayHours ? '2-digit' : undefined,
          minute: options.displayHours ? '2-digit' : undefined,
          month: 'short',
          day: 'numeric'
        }
      });

      return dateElement.element.textContent;
    };

    const getLabelTime: Parameters<typeof createLovelyChart>[1]['getLabelTime'] = (label) => {
      const date = new Date(label.value);
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
      const maskColor = mixColors(
        hexToRgb(customProperties.getProperty('primary-color')),
        hexToRgb(customProperties.getProperty('surface-color')),
        0.2
      );

      const colors: Parameters<typeof createLovelyChart>[1]['myColors'] = {
        'background': customProperties.getProperty('surface-color'),
        'text-color': customProperties.getProperty('primary-text-color'),
        'minimap-mask': `${rgbaToHexa(maskColor)}/0.6`,
        'minimap-slider': `${customProperties.getProperty('primary-color')}/0.2`,
        'grid-lines': `${customProperties.getProperty('secondary-text-color')}/0.2`,
        'zoom-out-text': customProperties.getProperty('primary-color'),
        'tooltip-background': customProperties.getProperty('background-color'),
        'tooltip-arrow': customProperties.getProperty('secondary-color'),
        'mask': `${customProperties.getProperty('surface-color')}/0.5`,
        'x-axis-text': customProperties.getProperty('secondary-text-color'),
        'y-axis-text': customProperties.getProperty('secondary-text-color')
      };

      for(const i in colors) {
        let color = colors[i as keyof typeof colors];
        const splitted = color.split('/');
        if(splitted.length === 2) {
          color = `rgba(${hexToRgb(splitted[0]).join(', ')}, ${splitted[1]})`;
        }

        document.documentElement.style.setProperty(`--lovely-chart-${i}`, color);
      }

      return colors;
    };
    let colors = makeColors();
    this.listenerSetter.add(rootScope)('theme_changed', () => {
      colors = makeColors();
    });

    const addOptions: Partial<Parameters<typeof createLovelyChart>[1]> = {
      axesFont: `${FontWeight} 10px ${FontFamily}`,
      pieFont: {weight: 500, font: FontFamily},
      myColors: {...colors},
      getLabelDate,
      getLabelTime
    };

    const titles = this.stats._ === 'stats.broadcastStats' ? CHANNEL_GRAPHS_TITLES : GROUP_GRAPH_TITLES;
    const graphs = Object.keys(titles).map((key) => {
      const statsGraph = this.stats[key as keyof typeof titles];
      return statsGraph && {
        statsGraph,
        title: titles[key as keyof typeof titles]
      };
    }).filter(Boolean);
    const renderGraph = ({statsGraph, title}: typeof graphs[0]) => {
      const graph = buildGraph(statsGraph);

      console.log('builded graph', graph);

      onMount(() => {
        const params: Parameters<typeof createLovelyChart>[1] = {
          ...addOptions,
          headerElements: {
            title: titleElement,
            caption: captionElement,
            zoomOut: zoomOutElement
          },
          ...graph.zoomToken ? {
            onZoom: async(x) => {
              const statsGraph = await this.managers.appStatisticsManager.loadAsyncGraph(graph.zoomToken, x, this.dcId);
              return {
                ...addOptions,
                ...buildGraph(statsGraph, graph.isPercentage)
              };
            },
            zoomOutLabel: I18n.format('ZoomOut', true)
          } : {},
          ...graph
        };

        const {onThemeChange} = createLovelyChart(container, params);
        this.listenerSetter.add(rootScope)('theme_changed', () => {
          onThemeChange({...colors});
        });
      });

      const titleElement = document.createElement('div');
      const captionElement = document.createElement('div');
      titleElement.classList.add('statistics-title');
      const t = i18n(title);
      t.classList.add('statistics-title-text');
      titleElement.append(t);
      let zoomOutElement: HTMLElement;
      if(graph.zoomToken || graph.isPercentage) {
        zoomOutElement = document.createElement('div');
        zoomOutElement.classList.add('statistics-title-zoom');
        zoomOutElement.append(Icon('zoomout', 'statistics-title-zoom-icon'), i18n('ZoomOut'));
        titleElement.append(zoomOutElement);
      }
      let container: HTMLDivElement;
      return (
        <Section name={titleElement} nameRight={captionElement}>
          <div class="statistics-chart" ref={container}></div>
        </Section>
      );
    };

    const overviewTitles = this.stats._ === 'stats.broadcastStats' ? CHANNEL_OVERVIEW_ITEMS : GROUP_OVERVIEW_ITEMS;
    const overviewItems: {value: StatsAbsValueAndPrev | StatsPercentValue, title: LangPackKey}[] = Object.keys(overviewTitles).map((key) => {
      const value = this.stats[key as keyof typeof overviewTitles];
      return value && {
        value,
        title: overviewTitles[key as keyof typeof overviewTitles]
      };
    });

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

    const renderOverviewItem = ({value, title}: typeof overviewItems[0]) => {
      const isPercentage = value._ === 'statsPercentValue';
      let v: JSX.Element;
      if(isPercentage) {
        const n = (value.part / value.total * 100).toFixed(2);
        v = `${n}%`;
      } else {
        v = formatNumber(value.current, 1);

        if(!value.current && !value.previous) {
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

    const topPeersTitles: [LangPackKey, LangPackKey, LangPackKey] = ['TopMembers', 'TopAdmins', 'TopInviters'];
    let postsContainer: HTMLDivElement;
    const ret = (
      <>
        <Section name="StatisticOverview" nameRight={formatDateRange(this.stats.period.min_date, this.stats.period.max_date)}>
          <div class="statistics-overview">
            <For each={overviewItems}>{renderOverviewItem}</For>
          </div>
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
            moreButton = Button('btn btn-primary btn-transparent primary', {icon: 'down', text: 'PollResults.LoadMore', textArgs: [topPeers.length]});
            attachClickEvent(moreButton, () => {
              moreButton.remove();
              chatlist.append(...topPeers.map(({container}) => container));
            }, {listenerSetter: this.listenerSetter});
          }
          return (
            <Section name={topPeersTitles[idx()]} nameRight={formatDateRange(this.stats.period.min_date, this.stats.period.max_date)}>
              {chatlist}
              {moreButton}
            </Section>
          );
        }}</For>
      </>
    );

    if(postsContainer) {
      const map: Map<HTMLElement, PostInteractionCounters> = new Map();
      recentPosts.forEach(({container, postInteractionCounters}) => {
        map.set(container, postInteractionCounters);
      });

      const findTarget = (e: MouseEvent) => findUpClassName(e.target, 'statistics-post');
      const findCounters = (e: MouseEvent) => map.get(findTarget(e));

      attachClickEvent(postsContainer, (e) => {
        const counters = findCounters(e);
        if(!counters) {
          return;
        }

        console.log(counters);
      }, {listenerSetter: this.listenerSetter});
    }

    return ret;
  }

  private async renderRecentPost(postInteractionCounters: PostInteractionCounters) {
    const subtitleRightFragment = document.createDocumentFragment();
    const a: [Icon, number][] = [
      ['reactions', postInteractionCounters.reactions],
      ['reply', postInteractionCounters.forwards]
    ];

    a.forEach(([icon, count]) => {
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
      titleRight: i18n('Views', [numberThousandSplitter(postInteractionCounters.views)]),
      subtitle: true,
      subtitleRight: subtitleRightFragment,
      clickable: true,
      noWrap: true
    });

    const {container} = row;
    container.classList.add('statistics-post');

    row.title.classList.add('statistics-post-title');

    const middleware = this.middlewareHelper.get();
    const mediaEl = document.createElement('div');
    mediaEl.classList.add('statistics-post-media');
    if(postInteractionCounters._ === 'postInteractionCountersMessage') {
      container.classList.add('statistics-post-message');
      const message = this.messages.get(postInteractionCounters.msg_id);
      const isMediaSet = await wrapReplyDivAndCaption({
        titleEl: row.subtitle,
        title: formatFullSentTime(message.date),
        subtitleEl: row.title,
        message,
        mediaEl,
        middleware,
        withoutMediaType: true
      });

      if(isMediaSet) {
        row.applyMediaElement(mediaEl, 'abitbigger');
      }
    } else {
      container.classList.add('statistics-post-story');
      const storyItem = this.stories.get(postInteractionCounters.story_id);
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

  private renderTopPeer = async(topPoster: StatsGroupTopPoster | StatsGroupTopAdmin | StatsGroupTopInviter) => {
    const peerId = topPoster.user_id.toPeerId(false);
    const loadPromises: Promise<any>[] = [];
    const {dom} = appDialogsManager.addDialogNew({
      peerId: peerId,
      container: false,
      rippleEnabled: true,
      avatarSize: 'abitbigger',
      loadPromises,
      wrapOptions: {
        middleware: this.middlewareHelper.get()
      }
    });

    let toJoin: Node[];
    if(topPoster._ === 'statsGroupTopPoster') {
      toJoin = [
        topPoster.messages && i18n('messages', [topPoster.messages]),
        topPoster.avg_chars && i18n('CharactersPerMessage', [i18n('Characters', [topPoster.avg_chars])])
      ];
    } else if(topPoster._ === 'statsGroupTopAdmin') {
      toJoin = [
        topPoster.deleted && i18n('Deletions', [topPoster.deleted]),
        topPoster.banned && i18n('Bans', [topPoster.banned]),
        topPoster.kicked && i18n('Restrictions', [topPoster.kicked])
      ];
    } else {
      toJoin = [
        topPoster.invitations && i18n('Invitations', [topPoster.invitations])
      ];
    }

    toJoin = toJoin.filter(Boolean);
    if(toJoin.length) {
      dom.lastMessageSpan.replaceChildren(...join(toJoin, false));
    }

    await Promise.all(loadPromises);
    return {container: dom.listEl, peerId};
  };

  private async loadStats() {
    const peerId = this.chatId.toPeerId(true);
    const manager = this.managers.appStatisticsManager;
    const func = this.isBroadcast ? manager.getBroadcastStats : manager.getMegagroupStats;
    const {stats, dcId} = await func(this.chatId);
    this.stats = stats;
    this.dcId = dcId;

    const promises: PromiseLike<any>[] = [];
    for(const key in stats) {
      const value = stats[key as keyof typeof stats];
      if((value as StatsGraph)._ === 'statsGraphAsync') {
        const promise = this.managers.appStatisticsManager.loadAsyncGraph(
          (value as StatsGraph.statsGraphAsync).token,
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
      } else if((value as StatsGraph)._ === 'statsGraphError') {
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

    const topPosters = (stats as StatsMegagroupStats).top_posters || [];
    const topAdmins = (stats as StatsMegagroupStats).top_admins || [];
    const topInvites = (stats as StatsMegagroupStats).top_inviters || [];
    const renderedTopPosters = topPosters.map(this.renderTopPeer);
    const renderedTopAdmins = topAdmins.map(this.renderTopPeer);
    const renderedTopInviters = topInvites.map(this.renderTopPeer);

    return Promise.all(promises).then(() => {
      const recentPostsPromises = recentPosts.map((postInteractionCounters) => {
        return this.renderRecentPost(postInteractionCounters);
      });

      const promises = [
        Promise.all(recentPostsPromises),
        Promise.all(renderedTopPosters),
        Promise.all(renderedTopAdmins),
        Promise.all(renderedTopInviters)
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
      ensureLovelyChart(),
      this.openPromise,
      this.loadStats()
    ]);

    const [hide, setHide] = createSignal(false);

    const element = await emptyPlaceholder({
      title: () => i18n('LoadingStats'),
      description: () => i18n('LoadingStatsDescription'),
      assetName: 'Stats',
      middleware: this.middlewareHelper.get(),
      hide,
      isFullSize: true
    });

    this.scrollable.append(element);
    promise.then(async([_, __, loaded]) => {
      console.log(this.stats, this.messages, this.stories);
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
