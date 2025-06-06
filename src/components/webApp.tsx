/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, Setter, Show} from 'solid-js';
import {hexToRgb, calculateLuminance, getTextColor, calculateOpacity, rgbaToRgb, rgbIntToHex} from '../helpers/color';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import safeWindowOpen from '../helpers/dom/safeWindowOpen';
import ListenerSetter from '../helpers/listenerSetter';
import safeAssign from '../helpers/object/safeAssign';
import themeController from '../helpers/themeController';
import {AttachMenuBot, DataJSON, WebViewResult, Document} from '../layer';
import appImManager from '../lib/appManagers/appImManager';
import {InternalLink, INTERNAL_LINK_TYPE} from '../lib/appManagers/internalLink';
import internalLinkProcessor from '../lib/appManagers/internalLinkProcessor';
import {AppManagers} from '../lib/appManagers/managers';
import getAttachMenuBotIcon from '../lib/appManagers/utils/attachMenuBots/getAttachMenuBotIcon';
import {LangPackKey} from '../lib/langPack';
import wrapEmojiText, {EmojiTextTsx} from '../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../lib/rootScope';
import {TelegramWebViewEventMap, AnyFunction, TelegramWebViewSendEventMap} from '../types';
import ButtonTsx from './buttonTsx';
import {ButtonMenuItemOptionsVerifiable} from './buttonMenu';
import confirmationPopup from './confirmationPopup';
import PopupElement from './popups';
import PopupPeer, {PopupPeerOptions} from './popups/peer';
import PopupPickUser from './popups/pickUser';
import TelegramWebView from './telegramWebView';
import wrapAttachBotIcon from './wrappers/attachBotIcon';
import getPeerTitle from './wrappers/getPeerTitle';
import wrapPeerTitle from './wrappers/peerTitle';
import classNames from '../helpers/string/classNames';
import {render} from 'solid-js/web';
import {attachClassName} from '../helpers/solid/classname';
import PopupWebAppEmojiStatusAccess from './popups/webAppEmojiStatusAccess';
import {toastNew} from './toast';
import tsNow from '../helpers/tsNow';
import PopupPremium from './popups/premium';
import {MyDocument} from '../lib/appManagers/appDocsManager';
import PopupWebAppLocationAccess from './popups/webAppLocationAccess';
import appSidebarRight from './sidebarRight';
import {IS_SAFARI} from '../environment/userAgent';
import {Transition} from '../vendor/solid-transition-group';
import {PreloaderTsx} from './putPreloader';
import ButtonIcon from './buttonIcon';
import ButtonMenuToggle from './buttonMenuToggle';
import type {RequestWebViewOptions} from '../lib/appManagers/appAttachMenuBotsManager';
import getPathFromBytes, {createSvgFromBytes} from '../helpers/bytes/getPathFromBytes';
import PopupWebAppPreparedMessage from './popups/webAppPreparedMessage';
import appDownloadManager from '../lib/appManagers/appDownloadManager';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import IS_WEB_APP_BROWSER_SUPPORTED from '../environment/webAppBrowserSupport';

const SANDBOX_ATTRIBUTES = [
  'allow-scripts',
  'allow-same-origin',
  'allow-popups',
  'allow-forms',
  'allow-modals',
  'allow-storage-access-by-user-activation'
].join(' ');

const DEVICEMOTION_TIMEOUT = 500;

export type WebAppLaunchOptions = {
  webViewResultUrl: WebApp['webViewResultUrl'],
  webViewOptions: WebApp['webViewOptions'],
  attachMenuBot?: AttachMenuBot,
  cacheKey?: string
};

export default class WebApp {
  private telegramWebView: TelegramWebView;
  private webViewResultUrl: WebViewResult.webViewResultUrl;
  private webViewOptions: RequestWebViewOptions;
  private attachMenuBot: AttachMenuBot;
  private isCloseConfirmationNeeded: boolean;
  private lastHeaderColor: TelegramWebViewEventMap['web_app_set_header_color'];
  private showSettingsButton: boolean;
  private readyResult: TelegramWebViewEventMap['iframe_ready'];
  private reloadTimeout: number;
  private iconElement: HTMLElement | SVGElement;
  private listenerSetter: ListenerSetter;
  private destroyed: boolean;
  // private mainButtonText: HTMLElement;

  public header: HTMLElement;
  public title: HTMLElement;
  public body: HTMLElement;

  public footer: HTMLElement;
  private setMainButtonState: (state: TelegramWebViewEventMap['web_app_setup_main_button']) => void;
  private setSecondaryButtonState: (state: TelegramWebViewEventMap['web_app_setup_secondary_button']) => void;
  private footerCleanup: () => void;

  private fullscreenButtons: HTMLElement;

  private forceHide: () => void;
  private onBackStatus: (visible: boolean) => void;

  private managers: AppManagers;

  public cacheKey: string;

  constructor(options: WebAppLaunchOptions & {
    header: WebApp['header'],
    title: WebApp['title'],
    body: WebApp['body'],
    forceHide: WebApp['forceHide'],
    onBackStatus: WebApp['onBackStatus']
  }) {
    safeAssign(this, options);

    this.listenerSetter = new ListenerSetter();
    this.managers = rootScope.managers

    this.title.classList.add('web-app-title');
    this.header.classList.add('web-app-header');
    this.body.classList.add('web-app-body');

    this.footer = document.createElement('div');
    this.body.append(this.footer);
    this.footerCleanup = render(() => this._constructFooter(), this.footer);

    this.fullscreenButtons = document.createElement('div');
    this.fullscreenButtons.classList.add('web-app-fullscreen-buttons');
    this.body.append(this.fullscreenButtons);

    const fullscreenCloseButton = ButtonIcon('close');
    const fullscreenMoreButton = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      buttons: this.getMenuButtons(),
      direction: 'bottom-left'
    });
    this.fullscreenButtons.append(fullscreenMoreButton, fullscreenCloseButton);

    attachClickEvent(fullscreenCloseButton, () => {
      document.exitFullscreen();
      this.forceHide();
    }, {listenerSetter: this.listenerSetter});

    attachClickEvent(fullscreenCloseButton, () => {
      document.exitFullscreen();
      this.forceHide();
    }, {listenerSetter: this.listenerSetter});

    this.listenerSetter.add(rootScope)('theme_changed', () => {
      this.setHeaderColor();
      this.sendTheme();
    });
    this.listenerSetter.add(rootScope)('attach_menu_bot', (attachMenuBot) => {
      if(this.webViewOptions.botId === attachMenuBot.bot_id) {
        this.attachMenuBot = attachMenuBot;
      }
    });

    if(this.webViewResultUrl._ === 'webViewResultUrl') {
      const queryId = this.webViewResultUrl.query_id;
      this.listenerSetter.add(rootScope)('web_view_result_sent', (_queryId) => {
        if(queryId === _queryId) {
          this.forceHide();
        }
      });
    }
  }

  protected _constructFooter() {
    const [mainButtonState, setMainButtonState] = createSignal<TelegramWebViewEventMap['web_app_setup_main_button']>({
      is_visible: false,
      is_active: false,
      is_progress_visible: false,
      color: 'primary',
      text: '',
      text_color: '#ffffff'
    });
    let mainButtonRef: HTMLElement;
    const [secondaryButtonState, setSecondaryButtonState] = createSignal<TelegramWebViewEventMap['web_app_setup_secondary_button']>({
      is_visible: false,
      is_active: false,
      is_progress_visible: false,
      color: 'primary',
      text: '',
      text_color: '#ffffff',
      position: 'left'
    });
    let secondaryButtonRef: HTMLElement;

    this.setMainButtonState = (state) => {
      setMainButtonState(state)
      if(state.color) themeController.applyAppColor({
        name: 'primary-color',
        element: mainButtonRef,
        hex: state.color,
        darkenAlpha: 0.04
      });
      mainButtonRef.style.setProperty('--text-color', state.text_color);
    };
    this.setSecondaryButtonState = (state) => {
      setSecondaryButtonState(state)
      if(state.color) themeController.applyAppColor({
        name: 'primary-color',
        element: secondaryButtonRef,
        hex: state.color,
        darkenAlpha: 0.04
      });
      secondaryButtonRef.style.setProperty('--text-color', state.text_color);
    };

    attachClassName(this.footer, () => classNames(
      'web-app-footer',
      (mainButtonState().is_visible || secondaryButtonState().is_visible) && 'is-visible',
      (mainButtonState().is_visible && secondaryButtonState().is_visible) && `has-two-buttons position-${secondaryButtonState().position}`,
    ));

    return (
      <>
        <ButtonTsx
          ref={secondaryButtonRef}
          class={classNames(
            'btn-primary',
            'btn-color-primary',
            'web-app-button',
            'web-app-button-secondary',
            secondaryButtonState().is_visible && 'is-visible',
            secondaryButtonState().is_active && 'is-active',
          )}
          disabled={!secondaryButtonState().is_active}
          onClick={() => this.telegramWebView.dispatchWebViewEvent('secondary_button_pressed', undefined)}
        >
          <Transition name="fade">
            {secondaryButtonState().is_progress_visible ?
              <PreloaderTsx /> :
              <EmojiTextTsx text={secondaryButtonState().text} />
            }
          </Transition>
        </ButtonTsx>
        <ButtonTsx
          ref={mainButtonRef}
          class={classNames(
            'btn-primary',
            'web-app-button',
            'btn-color-primary',
            mainButtonState().is_visible && 'is-visible',
          )}
          disabled={!mainButtonState().is_active}
          onClick={() => this.telegramWebView.dispatchWebViewEvent('main_button_pressed', undefined)}
        >
          <Transition name="fade">
            {mainButtonState().is_progress_visible ?
              <PreloaderTsx /> :
              <EmojiTextTsx text={mainButtonState().text} />
            }
          </Transition>
        </ButtonTsx>
      </>
    )
  }

  public onBackClick = (): false | void => {
    this.telegramWebView.dispatchWebViewEvent('back_button_pressed', undefined);
    return false;
  };

  public isConfirmationNeededOnClose = () => {
    if(!this.isCloseConfirmationNeeded) {
      return;
    }

    return confirmationPopup({
      descriptionLangKey: 'BotWebViewChangesMayNotBeSaved',
      button: {
        isDanger: true,
        langKey: 'BotWebViewCloseAnyway'
      }
    });
  };

  public getMenuButtons(): ButtonMenuItemOptionsVerifiable[] {
    const botId = this.webViewOptions.botId;
    const botPeerId = botId.toPeerId();

    return [{
      icon: 'settings',
      text: 'BotSettings',
      onClick: () => {
        this.telegramWebView.dispatchWebViewEvent('settings_button_pressed', undefined);
      },
      // verify: () => (this.attachMenuBot && this.attachMenuBot.pFlags.has_settings) || this.webViewOptions.hasSettings
      verify: () => this.showSettingsButton
    }, {
      icon: 'bots',
      text: 'BotWebViewOpenBot',
      onClick: () => {
        this.forceHide();
        appImManager.setInnerPeer({peerId: botPeerId});
      },
      verify: () => this.webViewOptions.peerId !== botPeerId
    }, {
      icon: 'rotate_left',
      text: 'BotWebViewReloadPage',
      onClick: () => {
        const fallbackReload = () => {
          const oldWebView = this.telegramWebView;
          const telegramWebView = this.createWebView();
          oldWebView.iframe.replaceWith(telegramWebView.iframe);
          oldWebView.destroy();
          telegramWebView.onMount();
        };

        if(!this.readyResult?.reload_supported) {
          fallbackReload();
          return;
        }

        this.reloadTimeout = window.setTimeout(() => {
          this.reloadTimeout = undefined;
          fallbackReload();
        }, 300);

        this.telegramWebView.dispatchWebViewEvent('reload_iframe', undefined);
      },
      verify: () => true
    }, /* {
      icon: 'plusround',
      text: 'WebApp.InstallBot',
      onClick: () => {
        appImManager.toggleBotInAttachMenu(botId, true).then(async(attachMenuBot) => {
          this.attachMenuBot = attachMenuBot;
        });
      },
      verify: () => this.attachMenuBot && this.attachMenuBot.pFlags.inactive
    },  */{
      icon: 'delete',
      className: 'danger',
      text: 'BotWebViewDeleteBot',
      onClick: () => {
        appImManager.toggleBotInAttachMenu(botId, false).then(async(attachMenuBot) => {
          this.attachMenuBot = attachMenuBot;
          this.forceHide();
        });
      },
      verify: () => this.attachMenuBot && !this.attachMenuBot.pFlags.inactive,
      separator: true
    }];
  }

  protected getThemeParams() {
    return themeController.getThemeParamsForWebView();
  }

  protected sendTheme = () => {
    this.telegramWebView.dispatchWebViewEvent('theme_changed', {
      theme_params: this.getThemeParams()
    });
  };

  protected setHeaderColor = (color: WebApp['lastHeaderColor'] = this.lastHeaderColor) => {
    this.lastHeaderColor = color;

    let backgroundColor: string;
    const hex = color.color;
    if(hex) {
      const rgb = hexToRgb(hex);
      const luminance = calculateLuminance(rgb);
      const textColor = getTextColor(luminance);
      const textOpacity = calculateOpacity(luminance, 2.5);
      const textRgbColor = rgbaToRgb([...textColor, textOpacity], rgb);
      // const borderColor = rgbaToRgb([...rgb, 1 - 0.08], rgb || rgbaToRgb([255, 255, 255, 0.08], rgb));
      backgroundColor = hex;
      this.title.style.color = `rgb(${textColor.join(',')})`;
      this.header.style.setProperty('--secondary-text-color', `rgb(${textRgbColor.join(', ')})`);
      this.header.style.setProperty('--light-secondary-text-color', `rgba(${textColor.join(', ')}, ${0.08})`);
      // this.header.style.setProperty('--border-color', `rgb(${borderColor.join(', ')})`);
      this.header.style.setProperty('--border-color', `rgba(${textColor.join(', ')}, ${0.08})`);
    } else {
      backgroundColor = this.getThemeParams()[color.color_key];
      this.title.style.color = '';
      this.header.style.removeProperty('--secondary-text-color');
      this.header.style.removeProperty('--light-secondary-text-color');
      this.header.style.removeProperty('--border-color');
    }

    this.header.style.backgroundColor = backgroundColor;
  };

  protected setBodyColor = (color: string) => {
    this.body.style.backgroundColor = color;
  };

  protected switchInlineQuery = async({
    query,
    chat_types
  }: TelegramWebViewEventMap['web_app_switch_inline_query']) => {
    const user = await this.managers.appUsersManager.getUser(this.webViewOptions.botId);
    if(user.bot_inline_placeholder === undefined) {
      return;
    }

    this.forceHide();

    const chat = appImManager.chat;
    let peerId = chat.peerId, threadId = chat.threadId;
    if(chat_types?.length) {
      const chosenPeerId = await PopupPickUser.createPicker(chat_types, ['send_inline']);
      if(peerId !== chosenPeerId) {
        peerId = chosenPeerId;
        threadId = undefined;
        await appImManager.setInnerPeer({peerId});
      }
    }

    this.managers.appInlineBotsManager.switchInlineQuery(
      peerId,
      threadId,
      this.webViewOptions.botId,
      query
    );
  };

  protected setupBackButton = ({
    is_visible
  }: TelegramWebViewEventMap['web_app_setup_back_button']) => {
    this.onBackStatus(is_visible);
  };

  protected setupSettingsButton = ({
    is_visible
  }: TelegramWebViewEventMap['web_app_setup_settings_button']) => {
    this.showSettingsButton = is_visible;
  };

  protected openPopup = async({
    title,
    message,
    buttons
  }: TelegramWebViewEventMap['web_app_open_popup']) => {
    const buttonLangPackKeysMap: {[type in typeof buttons[0]['type']]?: LangPackKey} = {
      cancel: 'Cancel',
      close: 'Close',
      ok: 'OK'
    };

    let pressedButtonId: string;
    const popup = PopupElement.createPopup(
      PopupPeer,
      'popup-confirmation',
      {
        title: title ? wrapEmojiText(title) : undefined,
        description: wrapEmojiText(message),
        buttons: buttons.map(({type, text, id}) => {
          const langPackKey = buttonLangPackKeysMap[type];
          const button: PopupPeerOptions['buttons'][0] = {
            langKey: langPackKey,
            text: !langPackKey ? wrapEmojiText(text) : undefined,
            isCancel: true,
            isDanger: type === 'destructive',
            callback: () => {
              pressedButtonId = id;
            }
          };

          return button;
        })
      }
    );

    const promise = new Promise<void>((resolve) => {
      popup.addEventListener('close', () => {
        this.telegramWebView.dispatchWebViewEvent('popup_closed', {
          ...(pressedButtonId !== undefined ? {button_id: pressedButtonId} : {})
        });
        resolve();
      });
    });

    popup.show();

    return promise;
  };

  public destroy() {
    this.destroyed = true;
    this.telegramWebView.destroy();
    this.listenerSetter.removeAll();
    clearTimeout(this._deviceMotionTimeoutId);
    clearTimeout(this._deviceOrientationTimeoutId);
    window.removeEventListener('devicemotion', this.handleDeviceMotion);
    window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    window.removeEventListener('deviceorientationabsolute', this.handleDeviceOrientation);
    this.footerCleanup();
  }


  protected debouncePopupMethod<T extends AnyFunction, K extends keyof TelegramWebViewSendEventMap>(
    callback: T,
    resultType: K,
    debouncedResult: TelegramWebViewSendEventMap[K]
  ) {
    let isOpen = false, debouncing = false;
    return (async(...args: any[]) => {
      if(isOpen) {
        return;
      }

      const {lastDispatchedWebViewEvent} = this.telegramWebView;
      if(!debouncing && lastDispatchedWebViewEvent?.type === resultType && lastDispatchedWebViewEvent.count >= 3) {
        debouncing = true;
        setTimeout(() => {
          if(this.telegramWebView.lastDispatchedWebViewEvent === lastDispatchedWebViewEvent) {
            this.telegramWebView.lastDispatchedWebViewEvent.count = 0;
          }
          debouncing = false;
        }, 3000);
      }

      if(debouncing) {
        this.telegramWebView.dispatchWebViewEvent(resultType, debouncedResult);
        return;
      }

      isOpen = true;
      try {
        await callback(...args);
      } finally {
        isOpen = false;
      }
    }) as T;
  }

  protected handleReadClipboard = async({req_id}: TelegramWebViewEventMap['web_app_read_text_from_clipboard']) => {
    const result: TelegramWebViewSendEventMap['clipboard_text_received'] = {
      req_id
    };

    if(this.attachMenuBot && !this.attachMenuBot.pFlags.inactive) try {
      const permission = await navigator.permissions.query({
        // @ts-ignore
        name: 'clipboard-read'
      });

      if(permission.state === 'granted') {
        result.data = await navigator.clipboard.readText();
      }
    } catch(error) {
      console.error('clipboard read error', error);
    }

    this.telegramWebView.dispatchWebViewEvent('clipboard_text_received', result);
  }

  protected handleHapticFeedback = (data: TelegramWebViewEventMap['web_app_trigger_haptic_feedback']) => {
    let pattern: number[]
    switch(data.type) {
      case 'impact':
        switch(data.impact_style) {
          case 'light':
            pattern = [60];
            break;
          case 'medium':
            pattern = [70];
            break;
          case 'heavy':
            pattern = [80]
            break;
          case 'rigid':
            pattern = [50]
            break;
          case 'soft':
            pattern = [55]
            break;
        }
        break
      case 'notification':
        switch(data.notification_type) {
          case 'error':
            pattern = [40, 60, 40, 60, 65, 60, 40];
            break;
          case 'success':
            pattern = [50, 60, 65];
            break;
          case 'warning':
            pattern = [65, 60, 40];
            break;
        }
      case 'selection_change':
        pattern = [30];
        break;
    }

    if(pattern) {
      navigator.vibrate(pattern);
    }
  }

  protected handleSetEmojiStatus = this.debouncePopupMethod(async(data) => {
    const {telegramWebView, managers, webViewOptions} = this;
    const doc = await managers.appEmojiManager.getCustomEmojiDocument(data.custom_emoji_id);
    if(!doc) {
      telegramWebView.dispatchWebViewEvent('emoji_status_failed', {error: 'SUGGESTED_EMOJI_INVALID'});
      return
    }

    const duration = data.duration ?? 0;
    const popup = PopupElement.createPopup(PopupWebAppEmojiStatusAccess, {
      botId: webViewOptions.botId.toPeerId(),
      sticker: doc,
      period: duration
    });

    popup.addEventListener('finish', async(result) => {
      if(result) {
        if(!(await managers.rootScope.getPremium())) {
          PopupPremium.show({feature: 'emoji_status'});
          telegramWebView.dispatchWebViewEvent('emoji_status_failed', {error: 'SERVER_ERROR'});
          return;
        }

        try {
          await managers.appUsersManager.updateEmojiStatus({
            _: 'emojiStatus',
            document_id: data.custom_emoji_id,
            until: duration ? tsNow(true) + duration : undefined
          })
          toastNew({langPackKey: 'SetAsEmojiStatusInfo'});
          telegramWebView.dispatchWebViewEvent('emoji_status_set', undefined);
        } catch(err) {
          console.log(err);
          toastNew({langPackKey: 'Error.AnError'});
          telegramWebView.dispatchWebViewEvent('emoji_status_failed', {error: 'SERVER_ERROR'});
        }
      } else {
        telegramWebView.dispatchWebViewEvent('emoji_status_failed', {error: 'USER_DECLINED'});
      }
    });

    popup.show();
  }, 'emoji_status_failed', {error: 'USER_DECLINED'})

  protected handleEmojiStatusAccess = this.debouncePopupMethod(async() => {
    const {telegramWebView, managers, webViewOptions} = this;
    const peer = await managers.appProfileManager.getCachedFullUser(this.webViewOptions.botId);
    if(peer.pFlags.bot_can_manage_emoji_status) {
      telegramWebView.dispatchWebViewEvent('emoji_status_access_requested', {status: 'allowed'});
      return;
    }

    const defaultEmojis = await managers.appStickersManager.getLocalStickerSet('inputStickerSetEmojiDefaultStatuses')
    const popup = PopupElement.createPopup(PopupWebAppEmojiStatusAccess, {
      botId: webViewOptions.botId.toPeerId(),
      defaultStatusEmojis: defaultEmojis.documents as MyDocument[]
    });

    popup.addEventListener('finish', async(result) => {
      if(result) {
        if(!(await managers.rootScope.getPremium())) {
          PopupPremium.show({feature: 'emoji_status'});
          telegramWebView.dispatchWebViewEvent('emoji_status_access_requested', {status: 'cancelled'});
          return;
        }

        try {
          await managers.appBotsManager.toggleEmojiStatusPermission(this.webViewOptions.botId, true);
        } catch(err) {
          console.error(err);
          toastNew({langPackKey: 'Error.AnError'});
          telegramWebView.dispatchWebViewEvent('emoji_status_access_requested', {status: 'cancelled'});
          return
        }

        telegramWebView.dispatchWebViewEvent('emoji_status_access_requested', {status: 'allowed'});
      } else {
        telegramWebView.dispatchWebViewEvent('emoji_status_access_requested', {status: 'cancelled'});
      }
    });

    popup.show();
  }, 'emoji_status_access_requested', {status: 'cancelled'})

  protected handleCheckLocation = async() => {
    const {telegramWebView} = this;
    const browserPermission = await navigator.permissions.query({name: 'geolocation'});
    if(browserPermission.state === 'denied') {
      telegramWebView.dispatchWebViewEvent('location_checked', {available: false});
      return;
    }

    const botPermission = await this.managers.appBotsManager.readBotInternalStorage(this.webViewOptions.botId, 'locationPermission');

    telegramWebView.dispatchWebViewEvent('location_checked', {
      available: true,
      access_requested: botPermission != null,
      access_granted: botPermission === 'true'
    });
  }

  protected _requestLocationPopup = false
  protected handleRequestLocation = async() => {
    const botPermission = await this.managers.appBotsManager.readBotInternalStorage(this.webViewOptions.botId, 'locationPermission');

    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition((pos) => {
        this.telegramWebView.dispatchWebViewEvent('location_requested', {
          available: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          course: pos.coords.heading,
          speed: pos.coords.speed,
          horizontal_accuracy: pos.coords.accuracy,
          vertical_accuracy: pos.coords.altitudeAccuracy,
          course_accuracy: null,
          speed_accuracy: null
        });
      }, (err) => {
        console.error(err);
        this.telegramWebView.dispatchWebViewEvent('location_requested', {available: false});
      });
    }

    if(!botPermission) {
      if(this._requestLocationPopup) return;
      this._requestLocationPopup = true;
      const popup = PopupElement.createPopup(PopupWebAppLocationAccess, {
        botId: this.webViewOptions.botId.toPeerId()
      });
      popup.addEventListener('finish', async(result) => {
        this._requestLocationPopup = false;
        await this.managers.appBotsManager.writeBotInternalStorage(this.webViewOptions.botId, 'locationPermission', String(result));
        if(result) {
          sendLocation();
        } else {
          this.telegramWebView.dispatchWebViewEvent('location_requested', {available: false});
        }
      });
      popup.show();
      return
    }

    if(botPermission === 'true') {
      sendLocation();
    } else {
      this.telegramWebView.dispatchWebViewEvent('location_requested', {available: false});
    }
  }

  protected _gyroscopeFreqMs = -1;
  protected _gyroscopeLastEvent = 0;
  protected _accelerometerFreqMs = -1;
  protected _accelerometerLastEvent = 0;
  protected _deviceMotionTimeoutId: number | null = null;
  protected handleDeviceMotion = (event: DeviceMotionEvent) => {
    if(this._deviceMotionTimeoutId !== null) {
      clearTimeout(this._deviceMotionTimeoutId);
      this._deviceMotionTimeoutId = null;

      if(this._gyroscopeFreqMs !== -1) {
        if(event.rotationRate.alpha !== null && event.rotationRate.beta !== null && event.rotationRate.gamma !== null) {
          this.telegramWebView.dispatchWebViewEvent('gyroscope_started', undefined);
        } else {
          this.telegramWebView.dispatchWebViewEvent('gyroscope_failed', {error: 'UNSUPPORTED'});
          return;
        }
      }

      if(this._accelerometerFreqMs !== -1) {
        if(event.acceleration.x !== null && event.acceleration.y !== null && event.acceleration.z !== null) {
          this.telegramWebView.dispatchWebViewEvent('accelerometer_started', undefined);
        } else {
          this.telegramWebView.dispatchWebViewEvent('accelerometer_failed', {error: 'UNSUPPORTED'});
          return;
        }
      }
    }

    const shouldEmitGyroscope = this._gyroscopeFreqMs !== -1 && performance.now() - this._gyroscopeLastEvent > this._gyroscopeFreqMs;
    const shouldEmitAccelerometer = this._accelerometerFreqMs !== -1 && performance.now() - this._accelerometerLastEvent > this._accelerometerFreqMs;

    if(shouldEmitGyroscope) {
      this._gyroscopeLastEvent = performance.now();
      this.telegramWebView.dispatchWebViewEvent('gyroscope_changed', {
        x: event.rotationRate.alpha,
        y: event.rotationRate.beta,
        z: event.rotationRate.gamma
      });
    }

    if(shouldEmitAccelerometer) {
      this._accelerometerLastEvent = performance.now();
      this.telegramWebView.dispatchWebViewEvent('accelerometer_changed', {
        x: event.acceleration.x,
        y: event.acceleration.y,
        z: event.acceleration.z
      });
    }
  }

  protected _deviceOrientationFreqMs = -1;
  protected _deviceOrientationAbsolute = false;
  protected _deviceOrientationLastEvent = 0;
  protected _deviceOrientationTimeoutId: number | null = null;
  protected handleDeviceOrientation = (event: DeviceOrientationEvent) => {
    if(this._deviceOrientationTimeoutId !== null) {
      clearTimeout(this._deviceOrientationTimeoutId);
      this._deviceOrientationTimeoutId = null;

      if(event.alpha !== null && event.beta !== null && event.gamma !== null) {
        this.telegramWebView.dispatchWebViewEvent('device_orientation_started', undefined);
      } else {
        this.telegramWebView.dispatchWebViewEvent('device_orientation_failed', {error: 'UNSUPPORTED'});
        return;
      }
    }

    const shouldEmit = this._deviceOrientationFreqMs !== -1 && performance.now() - this._deviceOrientationLastEvent > this._deviceOrientationFreqMs;
    if(!shouldEmit) return;

    this.telegramWebView.dispatchWebViewEvent('device_orientation_changed', {
      absolute: event.absolute,
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma
    });
  }

  protected setupDeviceMotion() {
    window.removeEventListener('devicemotion', this.handleDeviceMotion);
    clearTimeout(this._deviceMotionTimeoutId);

    if(this._gyroscopeFreqMs !== -1 || this._accelerometerFreqMs !== -1) {
      window.addEventListener('devicemotion', this.handleDeviceMotion, true);

      this._deviceMotionTimeoutId = window.setTimeout(() => {
        if(this._gyroscopeFreqMs !== -1) {
          this.telegramWebView.dispatchWebViewEvent('gyroscope_failed', {error: 'UNSUPPORTED'});
        }
        if(this._accelerometerFreqMs !== -1) {
          this.telegramWebView.dispatchWebViewEvent('accelerometer_failed', {error: 'UNSUPPORTED'});
        }
      }, DEVICEMOTION_TIMEOUT);
    }
  }

  protected _fileDownloadPending = false;
  protected handleFileDownload = async(event: TelegramWebViewEventMap['web_app_request_file_download']) => {
    if(this._fileDownloadPending) return
    this._fileDownloadPending = true;

    const {telegramWebView, managers, webViewOptions} = this;

    try {
      const allow = await managers.apiManager.invokeApiSingle('bots.checkDownloadFileParams', {
        bot: await managers.appUsersManager.getUserInput(webViewOptions.botId),
        file_name: event.file_name,
        url: event.url
      })

      if(!allow) {
        telegramWebView.dispatchWebViewEvent('file_download_requested', {status: 'cancelled'});
        return
      }
    } catch(e) {
      telegramWebView.dispatchWebViewEvent('file_download_requested', {status: 'cancelled'});
      return
    }

    const popup = PopupElement.createPopup(PopupPeer, 'popup-confirmation', {
      titleLangKey: 'BotDownloadPromptTitle',
      descriptionLangKey: 'BotDownloadPromptText',
      descriptionLangArgs: [
        await wrapPeerTitle({peerId: webViewOptions.botId.toPeerId()}),
        event.file_name
      ],
      buttons: [
        {
          langKey: 'BotDownloadAccept',
          callback: () => {
            this._fileDownloadPending = false;
            telegramWebView.dispatchWebViewEvent('file_download_requested', {status: 'downloading'});
            // try downloading with fetch
            appDownloadManager.downloadToDisc({
              media: {
                _: 'inputWebFileLocation',
                url: 'web-app-ext:' + event.url,
                access_hash: ''
              },
              fileName: event.file_name
            }).catch((e) => {
              this._fileDownloadPending = false;
              PopupElement.createPopup(PopupPeer, 'popup-confirmation', {
                titleLangKey: 'BotDownloadPromptTitle',
                descriptionLangKey: 'BotDownloadPromptManual',
                buttons: [
                  // <a download="..." /> only works for same-origin urls
                  {langKey: 'Confirm', callback: () => safeWindowOpen(event.url)},
                  {langKey: 'Cancel', isCancel: true}
                ]
              }).show()
            });
          }
        },
        {
          langKey: 'Cancel',
          isCancel: true
        }
      ]
    })

    popup.addEventListener('close', () => {
      if(this._fileDownloadPending) {
        this._fileDownloadPending = false;
        telegramWebView.dispatchWebViewEvent('file_download_requested', {status: 'cancelled'});
      }
    })

    popup.show()
  }

  protected createWebView() {
    const telegramWebView = this.telegramWebView = new TelegramWebView({
      url: this.webViewResultUrl.url.replace('tgWebAppVersion=8.0', 'tgWebAppVersion=9.0'), // fixme
      sandbox: SANDBOX_ATTRIBUTES,
      allow: 'camera; microphone; geolocation; accelerometer; gyroscope; magnetometer; device-orientation;',
      onLoad: () => {
        if(this.iconElement) {
          this.iconElement.style.opacity = '0';
        }

        telegramWebView.iframe.style.opacity = '1';
        telegramWebView.iframe.classList.remove('disable-hover');
      }
    });

    telegramWebView.iframe.style.opacity = '0';
    telegramWebView.iframe.classList.add('disable-hover');
    telegramWebView.iframe.allowFullscreen = true;

    telegramWebView.addMultipleEventsListeners({
      iframe_ready: (result) => {
        this.readyResult = result;
      },
      iframe_will_reload: () => {
        if(this.reloadTimeout) {
          clearTimeout(this.reloadTimeout);
          this.reloadTimeout = undefined;
        }
      },
      web_app_ready: () => {
        if(this.iconElement) {
          this.iconElement.style.opacity = '0';
        }

        telegramWebView.iframe.style.opacity = '1';
        telegramWebView.iframe.classList.remove('disable-hover');
      },
      web_app_data_send: ({data}) => {
        if(!this.webViewOptions.isSimpleWebView || this.webViewOptions.fromSwitchWebView) {
          return;
        }

        this.forceHide();
        this.managers.appAttachMenuBotsManager.sendWebViewData(this.webViewOptions.botId, this.webViewOptions.buttonText, data);
      },
      web_app_close: () => {
        this.forceHide();
      },
      web_app_open_link: ({url}) => {
        this.managers.apiManager.getAppConfig().then((config) => {
          const url_ = new URL(url);
          if(config.web_app_allowed_protocols?.includes(url_.protocol.slice(0, -1))) {
            safeWindowOpen(url);
          }
        })
      },
      web_app_open_tg_link: ({path_full}) => {
        appImManager.openUrl('https://t.me' + path_full);
        // this.forceHide();
      },
      web_app_open_invoice: ({slug}) => {
        const link: InternalLink.InternalLinkInvoice = {
          _: INTERNAL_LINK_TYPE.INVOICE,
          slug
        };

        internalLinkProcessor.processInvoiceLink(link).then((popupPayment) => {
          popupPayment.addEventListener('finish', (result) => {
            telegramWebView.dispatchWebViewEvent('invoice_closed', {
              slug,
              status: result
            });
          });
        });
      },
      web_app_request_theme: this.sendTheme,
      web_app_set_background_color: ({color}) => this.setBodyColor(color),
      web_app_set_header_color: this.setHeaderColor,
      web_app_switch_inline_query: this.switchInlineQuery,
      web_app_setup_main_button: opts => this.setMainButtonState(opts),
      web_app_setup_secondary_button: opts => this.setSecondaryButtonState(opts),
      web_app_setup_back_button: this.setupBackButton,
      web_app_setup_settings_button: this.setupSettingsButton,
      web_app_setup_closing_behavior: ({need_confirmation}) => this.isCloseConfirmationNeeded = !!need_confirmation,
      web_app_open_popup: this.debouncePopupMethod(this.openPopup, 'popup_closed', {}),
      web_app_open_scan_qr_popup: () => telegramWebView.dispatchWebViewEvent('scan_qr_popup_closed', {}),
      web_app_read_text_from_clipboard: this.handleReadClipboard,
      web_app_request_write_access: this.debouncePopupMethod(async() => {
        const botId = this.webViewOptions.botId;
        const canSendMessage = await this.managers.appBotsManager.canSendMessage(botId);
        const status: TelegramWebViewSendEventMap['write_access_requested'] = {status: 'allowed'};
        if(!canSendMessage) {
          try {
            await confirmationPopup({
              titleLangKey: 'WebApp.WriteAccess.Title',
              descriptionLangKey: 'WebApp.WriteAccess.Description',
              descriptionLangArgs: [await wrapPeerTitle({peerId: botId.toPeerId(false)})],
              button: {
                langKey: 'OK'
              }
            });

            await this.managers.appBotsManager.allowSendMessage(botId);
          } catch(err) {
            status.status = 'cancelled';
          }
        }

        telegramWebView.dispatchWebViewEvent('write_access_requested', status);
      }, 'write_access_requested', {status: 'cancelled'}),
      web_app_request_phone: this.debouncePopupMethod(async() => {
        const status: TelegramWebViewSendEventMap['phone_requested'] = {status: 'sent'};
        try {
          const botId = this.webViewOptions.botId;
          await this.managers.appMessagesManager.unblockBot(botId);
          await appImManager.requestPhone(botId.toPeerId(false));
        } catch(err) {
          status.status = 'cancelled';
        }

        telegramWebView.dispatchWebViewEvent('phone_requested', status);
      }, 'phone_requested', {status: 'cancelled'}),
      web_app_invoke_custom_method: async({req_id, method, params}) => {
        let result: DataJSON.dataJSON, error: ApiError;
        try {
          result = await this.managers.appAttachMenuBotsManager.invokeWebViewCustomMethod(
            this.webViewOptions.botId,
            method,
            params
          );
        } catch(_error) {
          error = _error as ApiError;
        }

        telegramWebView.dispatchWebViewEvent('custom_method_invoked', {
          req_id,
          result: result && JSON.parse(result.data),
          error: error?.type
        });
      },
      web_app_biometry_get_info: () => telegramWebView.dispatchWebViewEvent('biometry_info_received', {
        available: false,
        access_requested: false,
        access_granted: false,
        token_saved: false,
        device_id: ''
      }),
      web_app_trigger_haptic_feedback: this.handleHapticFeedback,
      web_app_set_bottom_bar_color: ({color}) => {
        this.footer.style.background = color;
      },
      // we can't use w3c sensors reliably with iframes unfortunately: https://w3c.github.io/sensors/#focused-area :c
      web_app_start_accelerometer: (data) => {
        this._accelerometerFreqMs = 1000 / data.refresh_rate;
        this.setupDeviceMotion();
      },
      web_app_stop_accelerometer: () => {
        this._accelerometerFreqMs = -1;
        this.setupDeviceMotion();
        this.telegramWebView.dispatchWebViewEvent('accelerometer_stopped', undefined);
      },
      web_app_start_gyroscope: (data) => {
        this._gyroscopeFreqMs = 1000 / data.refresh_rate;
        this.setupDeviceMotion();
      },
      web_app_stop_gyroscope: () => {
        this._gyroscopeFreqMs = -1;
        this.setupDeviceMotion();
        this.telegramWebView.dispatchWebViewEvent('gyroscope_stopped', undefined);
      },
      web_app_start_device_orientation: (data) => {
        this._deviceOrientationFreqMs = 1000 / data.refresh_rate;
        this._deviceOrientationAbsolute = data.need_absolute && !IS_SAFARI;
        const eventName = this._deviceOrientationAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
        window.addEventListener(eventName, this.handleDeviceOrientation, true);

        this._deviceOrientationTimeoutId = window.setTimeout(() => {
          this.telegramWebView.dispatchWebViewEvent('device_orientation_failed', {error: 'UNSUPPORTED'});
        }, DEVICEMOTION_TIMEOUT);
      },
      web_app_stop_device_orientation: () => {
        this._deviceOrientationFreqMs = -1;
        const eventName = this._deviceOrientationAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
        window.removeEventListener(eventName, this.handleDeviceOrientation);
        this.telegramWebView.dispatchWebViewEvent('device_orientation_stopped', undefined);
        clearTimeout(this._deviceOrientationTimeoutId);
      },
      web_app_add_to_home_screen: (data) => {
        telegramWebView.dispatchWebViewEvent('home_screen_failed', {error: 'UNSUPPORTED'});
      },
      web_app_check_home_screen: (data) => {
        telegramWebView.dispatchWebViewEvent('home_screen_checked', {status: 'unsupported'});
      },
      web_app_set_emoji_status: this.handleSetEmojiStatus,
      web_app_request_emoji_status_access: this.handleEmojiStatusAccess,
      web_app_check_location: this.handleCheckLocation,
      web_app_request_location: this.handleRequestLocation,
      web_app_open_location_settings: async() => {
        const botPermission = await this.managers.appBotsManager.readBotInternalStorage(this.webViewOptions.botId, 'locationPermission');
        if(botPermission == null) return;
        appImManager.setInnerPeer({peerId: this.webViewOptions.botId.toPeerId()});
        appSidebarRight.toggleSidebar(true);
      },
      web_app_request_file_download: this.handleFileDownload,
      web_app_device_storage_save_key: async({req_id, key, value}) => {
        const error = await this.managers.appBotsManager.writeBotDeviceStorage(this.webViewOptions.botId, key, value);
        if(error) {
          this.telegramWebView.dispatchWebViewEvent('device_storage_failed', {req_id, error});
        } else {
          this.telegramWebView.dispatchWebViewEvent('device_storage_key_saved', {req_id});
        }
      },
      web_app_device_storage_get_key: async({req_id, key}) => {
        const value = await this.managers.appBotsManager.readBotDeviceStorage(this.webViewOptions.botId, key);
        this.telegramWebView.dispatchWebViewEvent('device_storage_key_received', {req_id, value: value ?? null});
      },
      web_app_device_storage_clear: async({req_id}) => {
        await this.managers.appBotsManager.clearBotDeviceStorage(this.webViewOptions.botId);
        this.telegramWebView.dispatchWebViewEvent('device_storage_cleared', {req_id});
      },
      web_app_request_fullscreen: () => {
        if(document.fullscreenElement === this.body) {
          this.telegramWebView.dispatchWebViewEvent('fullscreen_failed', {error: 'ALREADY_FULLSCREEN'});
          return
        }

        this.body.requestFullscreen().catch((err) => {
          console.error(err);
          this.telegramWebView.dispatchWebViewEvent('fullscreen_failed', {error: 'UNSUPPORTED'});
        });
      },
      web_app_exit_fullscreen: () => {
        if(document.fullscreenElement !== this.body) {
          return
        }

        document.exitFullscreen()
      },
      web_app_secure_storage_save_key: ({req_id}) => telegramWebView.dispatchWebViewEvent('secure_storage_failed', {req_id, error: 'UNSUPPORTED'}),
      web_app_secure_storage_get_key: ({req_id}) => telegramWebView.dispatchWebViewEvent('secure_storage_failed', {req_id, error: 'UNSUPPORTED'}),
      web_app_secure_storage_restore_key: ({req_id}) => telegramWebView.dispatchWebViewEvent('secure_storage_failed', {req_id, error: 'UNSUPPORTED'}),
      web_app_secure_storage_clear: ({req_id}) => telegramWebView.dispatchWebViewEvent('secure_storage_failed', {req_id, error: 'UNSUPPORTED'}),
      web_app_share_to_story: () => {
        toastNew({langPackKey:'BotStorySharingNotSupported'});
      },
      web_app_send_prepared_message: this.debouncePopupMethod(async({id}) => {
        let message
        try {
          message = await this.managers.appBotsManager.getPreparedMessage(this.webViewOptions.botId, id);
        } catch(err) {
          this.telegramWebView.dispatchWebViewEvent('prepared_message_failed', {error: (err as any).code});
          return
        }

        const popup = PopupElement.createPopup(PopupWebAppPreparedMessage, {
          message,
          botId: this.webViewOptions.botId
        });

        popup.addEventListener('finish', async(error) => {
          if(error) {
            this.telegramWebView.dispatchWebViewEvent('prepared_message_failed', {error});
          } else {
            this.telegramWebView.dispatchWebViewEvent('prepared_message_sent', undefined);
            this.forceHide();
          }
        });

        popup.show();
      }, 'prepared_message_failed', {error: 'USER_DECLINED'})
    });

    telegramWebView.iframe.classList.add('payment-verification');
    return telegramWebView;
  }

  public getPeerId() {
    if(this.attachMenuBot) {
      return this.attachMenuBot.bot_id.toPeerId(false);
    } else {
      return this.webViewOptions.botId.toPeerId(false);
    }
  }

  public async getTitle(plain: true): Promise<string>;
  public async getTitle(plain: false): Promise<HTMLElement | DocumentFragment>;

  public async getTitle(plain: boolean): Promise<string | HTMLElement | DocumentFragment> {
    if(!this.attachMenuBot) {
      const peerId = this.getPeerId();
      if(plain) return getPeerTitle({peerId, plainText: true});
      else return wrapPeerTitle({peerId});
    } else {
      if(plain) return this.attachMenuBot.short_name;
      else return wrapEmojiText(this.attachMenuBot.short_name);
    }
  }

  public notifyVisible(visible: boolean) {
    this.telegramWebView?.dispatchWebViewEvent('visibility_changed', {is_visible: visible});
  }

  public async init(mountCallback: () => MaybePromise<void>) {
    if(!this.attachMenuBot || !IS_WEB_APP_BROWSER_SUPPORTED) {
      this.title.append(await this.getTitle(false));
    }

    let hasIcon = false;
    this.iconElement = document.createElement('span');
    /* if(this.webViewOptions.app) {

    } else  */try {
      const attachMenuBot = this.attachMenuBot ?? await this.managers.appAttachMenuBotsManager.getAttachMenuBot(this.webViewOptions.botId);
      const icon = getAttachMenuBotIcon(attachMenuBot);
      if(icon) {
        await wrapAttachBotIcon({
          element: this.iconElement,
          doc: icon.icon as Document.document,
          size: 80,
          textColor: () => 'secondary-text-color',
          strokeWidth: () => .5
        });

        hasIcon = true;
      }
    } catch(err) {}


    const {bot_info: botInfo} = await this.managers.appProfileManager.getProfile(this.webViewOptions.botId);


    const bodyColorFromSettings = themeController.isNight() ? botInfo.app_settings?.background_dark_color : botInfo.app_settings?.background_color;
    const headerColorFromSettings = themeController.isNight() ? botInfo.app_settings?.header_dark_color : botInfo.app_settings?.header_color;

    if(botInfo?.app_settings?.placeholder_path) {
      const {svg, path} = createSvgFromBytes(botInfo.app_settings.placeholder_path);
      path.setAttributeNS(null, 'fill', 'currentColor');
      this.iconElement = svg;
      hasIcon = true;
    }

    if(hasIcon) {
      this.iconElement.classList.add('web-app-icon');
    } else {
      this.iconElement = undefined;
    }

    const telegramWebView = this.createWebView();

    this.setBodyColor(bodyColorFromSettings ? rgbIntToHex(bodyColorFromSettings) : this.getThemeParams().bg_color);
    this.setHeaderColor(headerColorFromSettings ? {color: rgbIntToHex(headerColorFromSettings)} : {color_key: 'bg_color'});
    this.body.prepend(...[this.iconElement, telegramWebView.iframe].filter(Boolean));

    this.body.addEventListener('fullscreenchange', () => {
      const isFullscreen = document.fullscreenElement === this.body;
      this.telegramWebView.dispatchWebViewEvent('fullscreen_changed', {is_fullscreen: isFullscreen});
      this.telegramWebView.dispatchWebViewEvent('content_safe_area_changed', {
        top: isFullscreen ? 56 : 0,
        left: 0,
        right: 0,
        bottom: 0
      });
      this.body.classList.toggle('is-fullscreen', isFullscreen);
    });

    if(this.webViewOptions.fullscreen || this.webViewResultUrl?.pFlags.fullscreen) {
      this.body.requestFullscreen().catch((err) => {
        console.error(err);
        this.telegramWebView.dispatchWebViewEvent('fullscreen_failed', {error: 'UNSUPPORTED'});
      });
    }

    Promise.resolve(mountCallback()).then(() => {
      telegramWebView.onMount();

      if(!this.webViewOptions.isSimpleWebView && (this.webViewResultUrl as WebViewResult.webViewResultUrl).query_id) {
        setTimeout(() => this.prolongWebView(), 50e3);
      }
    });
  }

  private prolongWebView() {
    this.managers.appAttachMenuBotsManager.prolongWebView({
      queryId: (this.webViewResultUrl as WebViewResult.webViewResultUrl).query_id,
      ...this.webViewOptions
    }).then(() => {
      if(this.destroyed) {
        return;
      }

      setTimeout(() => {
        if(this.destroyed) {
          return;
        }

        this.prolongWebView();
      }, 50e3);
    }, (err: ApiError) => {
      if(this.destroyed) {
        return;
      }

      if(err.type === 'QUERY_ID_INVALID') {
        this.forceHide();
      } else {
        console.error('web app prolong error', err);
      }
    });
  }
}
