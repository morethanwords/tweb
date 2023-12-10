/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {StatsAbsValueAndPrev, StatsBroadcastStats, StatsGraph, StatsPercentValue} from '../../../layer';
import I18n, {LangPackKey, i18n, joinElementsWith} from '../../../lib/langPack';
import Section from '../../section';
import {SliderSuperTabEventable} from '../../sliderTab';
import {For, render} from 'solid-js/web';
import {JSX, createSignal, onMount} from 'solid-js';
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

const OVERVIEW_ITEMS: {[key in keyof PickByType<StatsBroadcastStats, StatsAbsValueAndPrev | StatsPercentValue>]: LangPackKey} = {
  followers: 'FollowersChartTitle',
  enabled_notifications: 'EnabledNotifications',
  views_per_post: 'ViewsPerPost',
  views_per_story: 'ViewsPerStory',
  shares_per_post: 'SharesPerPost',
  shares_per_story: 'SharesPerStory',
  reactions_per_post: 'ReactionsPerPost',
  reactions_per_story: 'ReactionsPerStory'
};

let lovelyChartPromise: Promise<any>;
let createLovelyChart: typeof create;
function ensureLovelyChart() {
  return lovelyChartPromise ??= import('../../../lib/lovely-chart/LovelyChart').then((module) => {
    createLovelyChart = module.create;
  });
}

export function buildGraph(
  result: StatsGraph, isPercentage?: boolean
) {
  if(result?._ !== 'statsGraph') {
    return;
  }

  const data = JSON.parse(result.json.data);
  const [x, ...y] = data.columns;
  const hasSecondYAxis = data.y_scaled;

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
  private stats: StatsBroadcastStats;
  private dcId: DcId;
  private openPromise: CancellablePromise<void>;

  protected onOpenAfterTimeout(): void {
    this.openPromise.resolve();
  }

  private _construct() {
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

    const graphs = Object.keys(CHANNEL_GRAPHS_TITLES).map((key) => {
      const statsGraph = this.stats[key as keyof typeof CHANNEL_GRAPHS_TITLES];
      return statsGraph && {
        statsGraph,
        title: CHANNEL_GRAPHS_TITLES[key as keyof typeof CHANNEL_GRAPHS_TITLES],
        isPercentage: key === 'languages_graph'
      };
    }).filter(Boolean);
    const renderGraph = ({statsGraph, title, isPercentage}: typeof graphs[0]) => {
      const graph = buildGraph(statsGraph, isPercentage);

      onMount(() => {
        const params: Parameters<typeof createLovelyChart>[1] = {
          // title: I18n.format(title, true),
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
                ...buildGraph(statsGraph, isPercentage)
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
      if(graph.zoomToken || isPercentage) {
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

    const overviewItems = Object.keys(OVERVIEW_ITEMS).map((key) => {
      const value = this.stats[key as keyof typeof OVERVIEW_ITEMS];
      return value && {
        value,
        title: OVERVIEW_ITEMS[key as keyof typeof OVERVIEW_ITEMS]
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

    const ret = (
      <>
        <Section name="StatisticOverview" nameRight={formatDateRange(this.stats.period.min_date, this.stats.period.max_date)}>
          <div class="statistics-overview">
            <For each={overviewItems}>{renderOverviewItem}</For>
          </div>
        </Section>
        <For each={graphs}>{renderGraph}</For>
      </>
    );

    return ret;
  }

  private async loadStats() {
    const {stats, dcId} = await this.managers.appStatisticsManager.getBroadcastStats(this.chatId);
    this.stats = stats;
    this.dcId = dcId;

    const promises: Promise<any>[] = [];
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

    return Promise.all(promises);
  }

  public async init(chatId: ChatId) {
    this.container.classList.add('statistics-container');
    this.setTitle('Statistics');

    this.chatId = chatId;
    this.openPromise = deferredPromise<void>();

    const promise = Promise.all([
      ensureLovelyChart(),
      this.loadStats(),
      this.openPromise
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
    promise.then(async() => {
      const div = document.createElement('div');
      this.scrollable.append(div);
      const dispose = render(() => this._construct(), div);
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
