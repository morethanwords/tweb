/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import RangeSelector from '../../rangeSelector';
import Button from '../../button';
import CheckboxField from '../../checkboxField';
import RadioField from '../../radioField';
import rootScope from '../../../lib/rootScope';
import {IS_APPLE, IS_SAFARI} from '../../../environment/userAgent';
import Row, {CreateRowFromCheckboxField} from '../../row';
import AppBackgroundTab from './background';
import {LangPackKey, _i18n} from '../../../lib/langPack';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import assumeType from '../../../helpers/assumeType';
import {BaseTheme, MessagesAllStickers, StickerSet} from '../../../layer';
import LazyLoadQueue from '../../lazyLoadQueue';
import PopupStickers from '../../popups/stickers';
import eachMinute from '../../../helpers/eachMinute';
import {SliderSuperTabEventable} from '../../sliderTab';
import IS_GEOLOCATION_SUPPORTED from '../../../environment/geolocationSupport';
import AppQuickReactionTab from './quickReaction';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import {DEFAULT_THEME, State} from '../../../config/state';
import wrapStickerSetThumb from '../../wrappers/stickerSetThumb';
import wrapStickerToRow from '../../wrappers/stickerToRow';
import SettingSection, {generateSection} from '../../settingSection';
import {ScrollableX} from '../../scrollable';
import wrapStickerEmoji from '../../wrappers/stickerEmoji';
import {Theme} from '../../../layer';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import RLottiePlayer from '../../../lib/rlottie/rlottiePlayer';
import themeController from '../../../helpers/themeController';

export class RangeSettingSelector {
  public container: HTMLDivElement;
  public valueContainer: HTMLElement;
  private range: RangeSelector;

  public onChange: (value: number) => void;

  constructor(
    name: LangPackKey,
    step: number,
    initialValue: number,
    minValue: number,
    maxValue: number,
    writeValue = true
  ) {
    const BASE_CLASS = 'range-setting-selector';
    this.container = document.createElement('div');
    this.container.classList.add(BASE_CLASS);

    const details = document.createElement('div');
    details.classList.add(BASE_CLASS + '-details');

    const nameDiv = document.createElement('div');
    nameDiv.classList.add(BASE_CLASS + '-name');
    _i18n(nameDiv, name);

    const valueDiv = this.valueContainer = document.createElement('div');
    valueDiv.classList.add(BASE_CLASS + '-value');

    if(writeValue) {
      valueDiv.innerHTML = '' + initialValue;
    }

    details.append(nameDiv, valueDiv);

    this.range = new RangeSelector({
      step,
      min: minValue,
      max: maxValue
    }, initialValue);
    this.range.setListeners();
    this.range.setHandlers({
      onScrub: value => {
        if(this.onChange) {
          this.onChange(value);
        }

        if(writeValue) {
          // console.log('font size scrub:', value);
          valueDiv.innerText = '' + value;
        }
      }
    });

    this.container.append(details, this.range.container);
  }
}

export default class AppGeneralSettingsTab extends SliderSuperTabEventable {
  public static getInitArgs() {
    return {
      themes: rootScope.managers.appThemesManager.getThemes(),
      allStickers: rootScope.managers.appStickersManager.getAllStickers(),
      quickReaction: rootScope.managers.appReactionsManager.getQuickReaction()
    };
  }

  public init(p: ReturnType<typeof AppGeneralSettingsTab['getInitArgs']>) {
    this.container.classList.add('general-settings-container');
    this.setTitle('General');

    const section = generateSection.bind(null, this.scrollable);
    const promises: Promise<any>[] = [];

    {
      const container = section('Settings');

      const range = new RangeSettingSelector('TextSize', 1, rootScope.settings.messagesTextSize, 12, 20);
      range.onChange = (value) => {
        rootScope.managers.appStateManager.setByKey('settings.messagesTextSize', value);
      };

      const chatBackgroundButton = Button('btn-primary btn-transparent', {icon: 'image', text: 'ChatBackground'});

      const initArgs = AppBackgroundTab.getInitArgs();
      attachClickEvent(chatBackgroundButton, () => {
        this.slider.createTab(AppBackgroundTab).open(initArgs);
      });

      const animationsCheckboxField = new CheckboxField({
        text: 'EnableAnimations',
        name: 'animations',
        stateKey: 'settings.animationsEnabled',
        listenerSetter: this.listenerSetter
      });

      container.append(
        range.container,
        chatBackgroundButton,
        CreateRowFromCheckboxField(animationsCheckboxField).container
      );
    }

    {
      const container = section('ColorTheme');

      const scrollable = new ScrollableX(null);
      const themesContainer = scrollable.container;
      themesContainer.classList.add('themes-container');

      type K = {
        container: HTMLElement,
        theme: Theme,
        player?: RLottiePlayer,
        wallPaperContainers?: {[key in BaseTheme['_']]?: HTMLElement}
      };
      const themesMap = new Map<HTMLElement, K>();
      let currentTheme = themeController.getTheme();
      let isNight = themeController.isNight();

      const applyThemeOnItem = (item: K) => {
        themeController.applyTheme(item.theme, item.container);

        const previous = item.container.querySelector('.background-item');
        previous?.remove();

        const wallPaperContainer = item.wallPaperContainers[isNight ? 'baseThemeNight' : 'baseThemeClassic']
        if(wallPaperContainer) {
          item.container.prepend(wallPaperContainer);
        }
      };

      let lastOnFrameNo: (frameNo: number) => void;

      attachClickEvent(themesContainer, async(e) => {
        const container = findUpClassName(e.target, 'theme-container');
        if(!container) {
          return;
        }

        const lastActive = themesContainer.querySelector('.active');
        if(lastActive) {
          lastActive.classList.remove('active');
        }

        const item = themesMap.get(container);
        container.classList.add('active');

        await themeController.applyNewTheme(item.theme);

        lastOnFrameNo?.(-1);

        if(item.player && rootScope.settings.animationsEnabled) {
          if(IS_SAFARI) {
            if(item.player.paused) {
              item.player.restart();
            }
          } else {
            if(item.player.paused) {
              item.player.stop(true);
            }

            item.player.el[0].style.transform = 'scale(2)';

            const onFrameNo = lastOnFrameNo = (frameNo) => {
              if(item.player.maxFrame === frameNo || frameNo === -1) {
                item.player.el[0].style.transform = '';
                item.player.removeEventListener('enterFrame', onFrameNo);

                if(lastOnFrameNo === onFrameNo) {
                  lastOnFrameNo = undefined;
                }
              }
            };

            setTimeout(() => {
              if(lastOnFrameNo !== onFrameNo) {
                return;
              }

              item.player.play();
              item.player.addEventListener('enterFrame', onFrameNo);
            }, 250);
          }
        }
      }, {listenerSetter: this.listenerSetter});

      const availableBaseThemes: Set<BaseTheme['_']> = new Set(['baseThemeClassic', 'baseThemeNight']);

      const promise = p.themes.then(async(themes) => {
        const defaultThemes = themes.filter((theme) => theme.pFlags.default/*  && theme.settings[0].message_colors.length === 1 */);
        defaultThemes.unshift(DEFAULT_THEME);

        const promises = defaultThemes.map(async(theme) => {
          const container = document.createElement('div');
          const k: K = {
            container,
            theme,
            wallPaperContainers: {}
          };

          const results = theme.settings
          .filter((themeSettings) => availableBaseThemes.has(themeSettings.base_theme._))
          .map((themeSettings) => {
            const wallPaper = themeSettings.wallpaper;
            const result = AppBackgroundTab.addWallPaper(wallPaper);
            k.wallPaperContainers[themeSettings.base_theme._] = result.container;
            return result;
          });

          themesMap.set(container, k);

          applyThemeOnItem(k);

          if(theme.id === currentTheme.id) {
            container.classList.add('active');
          }

          const emoticon = theme.emoticon;
          const loadPromises: Promise<any>[] = [];
          let emoticonContainer: HTMLElement;
          if(emoticon) {
            emoticonContainer = document.createElement('div');
            emoticonContainer.classList.add('theme-emoticon');
            const size = 28 * 1.75;
            wrapStickerEmoji({
              div: emoticonContainer,
              width: size,
              height: size,
              emoji: theme.emoticon,
              managers: this.managers,
              loadPromises,
              middleware: this.middlewareHelper.get(),
              play: rootScope.settings.animationsEnabled
            }).then(({render}) => render).then((player) => {
              k.player = player as RLottiePlayer;
            });
          }

          const bubble = document.createElement('div');
          bubble.classList.add('theme-bubble');

          const bubbleIn = bubble.cloneNode() as HTMLElement;

          bubbleIn.classList.add('is-in');
          bubble.classList.add('is-out');

          loadPromises.push(...results.map((result) => result.loadPromise));

          container.classList.add('theme-container');

          await Promise.all(loadPromises);

          if(emoticonContainer) {
            container.append(emoticonContainer);
          }

          container.append(bubbleIn, bubble);

          return container;
        });

        const containers = await Promise.all(promises);

        scrollable.append(...containers);
      });

      promises.push(promise);

      const form = document.createElement('form');
      form.style.marginTop = '.5rem';

      const name = 'theme';
      const stateKey = 'settings.theme';

      const dayRow = new Row({
        radioField: new RadioField({
          langKey: 'ThemeDay',
          name,
          value: 'day',
          stateKey
        })
      });

      const nightRow = new Row({
        radioField: new RadioField({
          langKey: 'ThemeNight',
          name,
          value: 'night',
          stateKey
        })
      });

      const systemRow = new Row({
        radioField: new RadioField({
          langKey: 'AutoNightSystemDefault',
          name,
          value: 'system',
          stateKey
        })
      });

      this.listenerSetter.add(rootScope)('settings_updated', ({key, value, settings}) => {
        if(key === stateKey) {
          rootScope.dispatchEvent('theme_change');
        }
      });

      this.listenerSetter.add(rootScope)('theme_change', () => {
        currentTheme = themeController.getTheme();
        const newIsNight = themeController.isNight();
        if(isNight === newIsNight) {
          return;
        }

        isNight = newIsNight;

        const lastActive = themesContainer.querySelector('.active');
        if(lastActive) {
          lastActive.classList.remove('active');
        }

        let active: HTMLElement;
        themesMap.forEach((item) => {
          applyThemeOnItem(item);

          if(item.theme.id === currentTheme.id) {
            item.container.classList.add('active');
            active = item.container;
          }
        });

        if(active) {
          scrollable.scrollIntoViewNew({
            element: active,
            position: 'center',
            axis: 'x'
          });
        }
      });

      form.append(dayRow.container, nightRow.container, systemRow.container);

      container.append(
        themesContainer,
        form
      );
    }

    {
      const container = section('General.Keyboard');

      const form = document.createElement('form');

      const name = 'send-shortcut';
      const stateKey = 'settings.sendShortcut';

      const enterRow = new Row({
        radioField: new RadioField({
          langKey: 'General.SendShortcut.Enter',
          name,
          value: 'enter',
          stateKey
        }),
        subtitleLangKey: 'General.SendShortcut.NewLine.ShiftEnter'
      });

      const ctrlEnterRow = new Row({
        radioField: new RadioField({
          name,
          value: 'ctrlEnter',
          stateKey
        }),
        subtitleLangKey: 'General.SendShortcut.NewLine.Enter'
      });
      _i18n(ctrlEnterRow.radioField.main, 'General.SendShortcut.CtrlEnter', [IS_APPLE ? '⌘' : 'Ctrl']);

      form.append(enterRow.container, ctrlEnterRow.container);
      container.append(form);
    }

    if(IS_GEOLOCATION_SUPPORTED) {
      const container = section('DistanceUnitsTitle');

      const form = document.createElement('form');

      const name = 'distance-unit';
      const stateKey = 'settings.distanceUnit';

      const kilometersRow = new Row({
        radioField: new RadioField({
          langKey: 'DistanceUnitsKilometers',
          name,
          value: 'kilometers',
          stateKey
        })
      });

      const milesRow = new Row({
        radioField: new RadioField({
          langKey: 'DistanceUnitsMiles',
          name,
          value: 'miles',
          stateKey
        })
      });

      form.append(kilometersRow.container, milesRow.container);
      container.append(form);
    }

    {
      const container = section('General.TimeFormat');

      const form = document.createElement('form');

      const name = 'time-format';
      const stateKey = 'settings.timeFormat';

      const formats: [State['settings']['timeFormat'], LangPackKey][] = [
        ['h12', 'General.TimeFormat.h12'],
        ['h23', 'General.TimeFormat.h23']
      ];

      const rows = formats.map(([format, langPackKey]) => {
        const row = new Row({
          radioField: new RadioField({
            langKey: langPackKey,
            name,
            value: format,
            stateKey
          })
        });

        return row;
      });

      const cancel = eachMinute(() => {
        const date = new Date();

        formats.forEach(([format], idx) => {
          const str = date.toLocaleTimeString('en-us-u-hc-' + format, {
            hour: '2-digit',
            minute: '2-digit'
          });

          rows[idx].subtitle.textContent = str;
        });
      });

      this.eventListener.addEventListener('destroy', cancel);

      form.append(...rows.map((row) => row.container));
      container.append(form);
    }

    {
      const container = section('Emoji');

      const suggestCheckboxField = new CheckboxField({
        text: 'GeneralSettings.EmojiPrediction',
        name: 'suggest-emoji',
        stateKey: 'settings.emoji.suggest',
        listenerSetter: this.listenerSetter
      });
      const bigCheckboxField = new CheckboxField({
        text: 'GeneralSettings.BigEmoji',
        name: 'emoji-big',
        stateKey: 'settings.emoji.big',
        listenerSetter: this.listenerSetter
      });

      container.append(
        CreateRowFromCheckboxField(suggestCheckboxField).container,
        CreateRowFromCheckboxField(bigCheckboxField).container
      );
    }

    {
      const section = new SettingSection({name: 'Telegram.InstalledStickerPacksController', caption: 'StickersBotInfo'});

      const reactionsRow = new Row({
        titleLangKey: 'DoubleTapSetting',
        havePadding: true,
        clickable: () => {
          this.slider.createTab(AppQuickReactionTab).open();
        },
        listenerSetter: this.listenerSetter
      });

      const renderQuickReaction = () => {
        p.quickReaction.then((reaction) => {
          if(reaction._ === 'availableReaction') {
            return reaction.static_icon;
          } else {
            return this.managers.appEmojiManager.getCustomEmojiDocument(reaction.document_id);
          }
        }).then((doc) => {
          wrapStickerToRow({
            row: reactionsRow,
            doc,
            size: 'small'
          });
        });
      };

      renderQuickReaction();

      this.listenerSetter.add(rootScope)('quick_reaction', renderQuickReaction);

      const suggestCheckboxField = new CheckboxField({
        text: 'Stickers.SuggestStickers',
        name: 'suggest',
        stateKey: 'settings.stickers.suggest',
        listenerSetter: this.listenerSetter
      });
      const loopCheckboxField = new CheckboxField({
        text: 'InstalledStickers.LoopAnimated',
        name: 'loop',
        stateKey: 'settings.stickers.loop',
        listenerSetter: this.listenerSetter
      });

      const stickerSets: {[id: string]: Row} = {};

      const stickersContent = section.generateContentElement();

      const lazyLoadQueue = new LazyLoadQueue();
      const renderStickerSet = (stickerSet: StickerSet.stickerSet, method: 'append' | 'prepend' = 'append') => {
        const row = new Row({
          title: wrapEmojiText(stickerSet.title),
          subtitleLangKey: 'Stickers',
          subtitleLangArgs: [stickerSet.count],
          havePadding: true,
          clickable: () => {
            new PopupStickers({id: stickerSet.id, access_hash: stickerSet.access_hash}).show();
          },
          listenerSetter: this.listenerSetter
        });

        stickerSets[stickerSet.id] = row;

        const div = document.createElement('div');
        div.classList.add('row-media');

        wrapStickerSetThumb({
          set: stickerSet,
          container: div,
          group: 'GENERAL-SETTINGS',
          lazyLoadQueue,
          width: 36,
          height: 36,
          autoplay: true,
          middleware: this.middlewareHelper.get()
        });

        row.container.append(div);

        stickersContent[method](row.container);
      };

      const promise = p.allStickers.then((allStickers) => {
        assumeType<MessagesAllStickers.messagesAllStickers>(allStickers);
        const promises = allStickers.sets.map((stickerSet) => renderStickerSet(stickerSet));
        return Promise.all(promises);
      });

      promises.push(promise);

      this.listenerSetter.add(rootScope)('stickers_installed', (set) => {
        if(!stickerSets[set.id]) {
          renderStickerSet(set, 'prepend');
        }
      });

      this.listenerSetter.add(rootScope)('stickers_deleted', (set) => {
        if(stickerSets[set.id]) {
          stickerSets[set.id].container.remove();
          delete stickerSets[set.id];
        }
      });

      section.content.append(
        reactionsRow.container,
        CreateRowFromCheckboxField(suggestCheckboxField).container,
        CreateRowFromCheckboxField(loopCheckboxField).container
      );
      this.scrollable.append(section.container);
    }

    return Promise.all(promises);
  }
}
