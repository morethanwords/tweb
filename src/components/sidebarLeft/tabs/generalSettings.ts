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
import {IS_APPLE} from '../../../environment/userAgent';
import Row, {CreateRowFromCheckboxField} from '../../row';
import AppBackgroundTab, {getHexColorFromTelegramColor, getRgbColorFromTelegramColor} from './background';
import {LangPackKey, _i18n} from '../../../lib/langPack';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import assumeType from '../../../helpers/assumeType';
import {AvailableReaction, BaseTheme, MessagesAllStickers, StickerSet} from '../../../layer';
import LazyLoadQueue from '../../lazyLoadQueue';
import PopupStickers from '../../popups/stickers';
import eachMinute from '../../../helpers/eachMinute';
import {SliderSuperTabEventable} from '../../sliderTab';
import IS_GEOLOCATION_SUPPORTED from '../../../environment/geolocationSupport';
import AppQuickReactionTab from './quickReaction';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import {State} from '../../../config/state';
import wrapStickerSetThumb from '../../wrappers/stickerSetThumb';
import wrapStickerToRow from '../../wrappers/stickerToRow';
import SettingSection, {generateSection} from '../../settingSection';
import {ScrollableX} from '../../scrollable';
import wrapStickerEmoji from '../../wrappers/stickerEmoji';
import {Theme} from '../../../layer';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import RLottiePlayer from '../../../lib/rlottie/rlottiePlayer';
import {hexToRgb, ColorRgb, rgbaToHexa, rgbaToHsla, rgbToHsv, hsvToRgb} from '../../../helpers/color';
import clamp from '../../../helpers/number/clamp';
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
      accountThemes: rootScope.managers.apiManager.invokeApi('account.getThemes', {format: 'android', hash: 0}),
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

    if(false) {
      const container = section('ColorTheme');

      const scrollable = new ScrollableX(null);
      const themesContainer = scrollable.container;
      themesContainer.classList.add('themes-container');

      type K = {theme: Theme, player?: RLottiePlayer};
      const themesMap = new Map<HTMLElement, K>();

      type AppColorName = 'primary-color' | 'message-out-primary-color';
      type AppColor = {
        rgb?: boolean,
        light?: boolean,
        lightFilled?: boolean,
        dark?: boolean,
        darkRgb?: boolean,
        darkFilled?: boolean
      };

      const appColorMap: {[name in AppColorName]: AppColor} = {
        'primary-color': {
          rgb: true,
          light: true,
          lightFilled: true,
          dark: true,
          darkRgb: true
        },
        'message-out-primary-color': {
          rgb: true,
          light: true,
          lightFilled: true,
          dark: true
        }
      };

      var mix = function(color1: ColorRgb, color2: ColorRgb, weight: number) {
        const out = new Array<number>(3) as ColorRgb;
        for(let i = 0; i < 3; ++i) {
          const v1 = color1[i], v2 = color2[i];
          out[i] = Math.floor(v2 + (v1 - v2) * (weight / 100.0));
        }

        return out;
      };

      function computePerceivedBrightness(color: ColorRgb) {
        return (color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722) / 255;
      }

      function getAverageColor(color1: ColorRgb, color2: ColorRgb): ColorRgb {
        return color1.map((v, i) => Math.round((v + color2[i]) / 2)) as ColorRgb;
      }

      const getAccentColor = (baseHsv: number[], baseColor: ColorRgb, elementColor: ColorRgb): ColorRgb => {
        const hsvTemp3 = rgbToHsv(...baseColor);
        const hsvTemp4 = rgbToHsv(...elementColor);

        const dist = Math.min(1.5 * hsvTemp3[1] / baseHsv[1], 1);

        hsvTemp3[0] = Math.min(360, hsvTemp4[0] - hsvTemp3[0] + baseHsv[0]);
        hsvTemp3[1] = Math.min(1, hsvTemp4[1] * baseHsv[1] / hsvTemp3[1]);
        hsvTemp3[2] = Math.min(1, (hsvTemp4[2] / hsvTemp3[2] + dist - 1) * baseHsv[2] / dist);
        if(hsvTemp3[2] < 0.3) {
          return elementColor;
        }
        return hsvToRgb(...hsvTemp3);
      };

      const changeColorAccent = (baseHsv: number[], accentHsv: number[], color: ColorRgb, isDarkTheme = themeController.isNight()) => {
        const colorHsv = rgbToHsv(...color);

        const diffH = Math.min(Math.abs(colorHsv[0] - baseHsv[0]), Math.abs(colorHsv[0] - baseHsv[0] - 360));
        if(diffH > 30) {
          return color;
        }

        const dist = Math.min(1.5 * colorHsv[1] / baseHsv[1], 1);

        colorHsv[0] = Math.min(360, colorHsv[0] + accentHsv[0] - baseHsv[0]);
        colorHsv[1] = Math.min(1, colorHsv[1] * accentHsv[1] / baseHsv[1]);
        colorHsv[2] = Math.min(1, colorHsv[2] * (1 - dist + dist * accentHsv[2] / baseHsv[2]));

        let newColor = hsvToRgb(...colorHsv);

        const origBrightness = computePerceivedBrightness(color);
        const newBrightness = computePerceivedBrightness(newColor);

        // We need to keep colors lighter in dark themes and darker in light themes
        const needRevertBrightness = isDarkTheme ? origBrightness > newBrightness : origBrightness < newBrightness;

        if(needRevertBrightness) {
          const amountOfNew = 0.6;
          const fallbackAmount = (1 - amountOfNew) * origBrightness / newBrightness + amountOfNew;
          newColor = changeBrightness(newColor, fallbackAmount);
        }

        return newColor;
      };

      const changeBrightness = (color: ColorRgb, amount: number) => {
        return color.map((v) => clamp(Math.round(v * amount), 0, 255)) as ColorRgb;
      };

      const applyAppColor = ({
        name,
        hex,
        element = document.documentElement,
        lightenAlpha = 0.08,
        darkenAlpha = lightenAlpha
      }: {
        name: AppColorName,
        hex: string,
        element?: HTMLElement,
        lightenAlpha?: number
        darkenAlpha?: number
      }) => {
        const appColor = appColorMap[name];
        const rgb = hexToRgb(hex);
        const hsla = rgbaToHsla(...rgb);

        const mixColor2 = hexToRgb(themeController.isNight() ? '#212121' : '#ffffff');
        const lightenedRgb = mix(rgb, mixColor2, lightenAlpha * 100);

        const darkenedHsla: typeof hsla = {
          ...hsla,
          l: hsla.l - darkenAlpha * 100
        };

        element.style.setProperty('--' + name, hex);
        appColor.rgb && element.style.setProperty('--' + name + '-rgb', rgb.join(','));
        appColor.light && element.style.setProperty('--light-' + name, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${lightenAlpha})`);
        appColor.lightFilled && element.style.setProperty('--light-filled-' + name, `rgb(${lightenedRgb[0]}, ${lightenedRgb[1]}, ${lightenedRgb[2]})`);
        appColor.dark && element.style.setProperty('--dark-' + name, `hsl(${darkenedHsla.h}, ${darkenedHsla.s}%, ${darkenedHsla.l}%)`);
        // appColor.darkFilled && element.style.setProperty('--dark-' + name, `hsl(${darkenedHsla.h}, ${darkenedHsla.s}%, ${darkenedHsla.l}%)`);
      };

      const applyTheme = (theme: Theme, element = document.documentElement) => {
        const isNight = themeController.isNight();
        const themeSettings = theme.settings.find((settings) => settings.base_theme._ === (isNight ? 'baseThemeNight' : 'baseThemeClassic'));

        console.log('applyTheme', theme, themeSettings);

        // android `accentBaseColor` and `key_chat_outBubble`
        const PRIMARY_COLOR = isNight ? '#3e88f6' : '#328ace';
        const LIGHT_PRIMARY_COLOR = isNight ? '#366cae' : '#e6f2fb';

        const hsvTemp1 = rgbToHsv(...hexToRgb(PRIMARY_COLOR)); // primary base
        let hsvTemp2 = rgbToHsv(...getRgbColorFromTelegramColor(themeSettings.accent_color)); // new primary

        const newAccentRgb = changeColorAccent(
          hsvTemp1,
          hsvTemp2,
          hexToRgb(PRIMARY_COLOR)
          // hexToRgb('#eeffde')
        );
        const newAccentHex = rgbaToHexa(newAccentRgb);

        let h = getHexColorFromTelegramColor(themeSettings.accent_color);
        console.log(h, newAccentHex);
        h = newAccentHex;

        applyAppColor({
          name: 'primary-color',
          hex: h,
          // hex: newAccentHex,
          element,
          darkenAlpha: 0.04
        });

        if(element === document.documentElement) {
          AppBackgroundTab.setBackgroundDocument(themeSettings.wallpaper);
        }

        if(!themeSettings.message_colors?.length) {
          return;
        }

        const messageOutRgbColor = hexToRgb(LIGHT_PRIMARY_COLOR); // light primary

        const firstColor = getRgbColorFromTelegramColor(themeSettings.message_colors[0]);

        let messageColor = firstColor;
        if(themeSettings.message_colors.length > 1) {
          themeSettings.message_colors.slice(1).forEach((nextColor) => {
            messageColor = getAverageColor(messageColor, getRgbColorFromTelegramColor(nextColor));
          });

          messageColor = getAccentColor(hsvTemp1, messageOutRgbColor, firstColor);
        }

        const o = messageColor;
        // const hsvTemp1 = rgbToHsv(...hexToRgb('#4fae4e'));
        // const hsvTemp1 = rgbToHsv(...hexToRgb('#328ace'));
        hsvTemp2 = rgbToHsv(...o);

        const c = changeColorAccent(
          hsvTemp1,
          hsvTemp2,
          messageOutRgbColor
          // hexToRgb('#eeffde')
        );

        console.log(o, c);

        applyAppColor({
          name: 'message-out-primary-color',
          hex: rgbaToHexa(messageColor),
          element,
          lightenAlpha: isNight ? 0.76 : 0.12
        });
      };

      attachClickEvent(themesContainer, (e) => {
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

        if(item.player) {
          if(item.player.paused) {
            item.player.restart();
          }
        }

        applyTheme(item.theme);
      }, {listenerSetter: this.listenerSetter});

      const promise = p.accountThemes.then(async(accountThemes) => {
        if(accountThemes._ === 'account.themesNotModified') {
          return;
        }

        console.log(accountThemes);

        const defaultThemes = accountThemes.themes.filter((theme) => theme.pFlags.default);
        const promises = defaultThemes.map(async(theme, idx) => {
          const baseTheme: BaseTheme['_'] = themeController.isNight() ? 'baseThemeNight' : 'baseThemeClassic';
          const wallpaper = theme.settings.find((settings) => settings.base_theme._ === baseTheme).wallpaper;
          const result = AppBackgroundTab.addWallPaper(wallpaper);

          const container = result.container;
          const k: K = {theme};
          themesMap.set(container, k);

          applyTheme(theme, container);

          if(idx === 0) {
            container.classList.add('active');
          }

          const emoticon = theme.emoticon;
          const loadPromises: Promise<any>[] = [];
          let emoticonContainer: HTMLElement;
          if(emoticon) {
            emoticonContainer = document.createElement('div');
            emoticonContainer.classList.add('theme-emoticon');
            const size = 28;
            wrapStickerEmoji({
              div: emoticonContainer,
              width: size,
              height: size,
              emoji: theme.emoticon,
              managers: this.managers,
              loadPromises,
              middleware: this.middlewareHelper.get()
            }).then(({render}) => render).then((player) => {
              k.player = player as RLottiePlayer;
            });
          }

          const bubble = document.createElement('div');
          bubble.classList.add('theme-bubble');

          const bubbleIn = bubble.cloneNode() as HTMLElement;

          bubbleIn.classList.add('is-in');
          bubble.classList.add('is-out');

          loadPromises.push(result.loadPromise);

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

      container.append(
        themesContainer
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
