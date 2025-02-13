/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {hexToRgb, calculateLuminance, getTextColor, calculateOpacity, rgbaToRgb} from '../helpers/color';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import safeWindowOpen from '../helpers/dom/safeWindowOpen';
import ListenerSetter from '../helpers/listenerSetter';
import safeAssign from '../helpers/object/safeAssign';
import themeController from '../helpers/themeController';
import {AttachMenuBot, DataJSON, WebViewResult, Document} from '../layer';
import type AppAttachMenuBotsManager from '../lib/appManagers/appAttachMenuBotsManager';
import appImManager from '../lib/appManagers/appImManager';
import {InternalLink, INTERNAL_LINK_TYPE} from '../lib/appManagers/internalLink';
import internalLinkProcessor from '../lib/appManagers/internalLinkProcessor';
import {AppManagers} from '../lib/appManagers/managers';
import getAttachMenuBotIcon from '../lib/appManagers/utils/attachMenuBots/getAttachMenuBotIcon';
import {LangPackKey} from '../lib/langPack';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../lib/rootScope';
import {TelegramWebViewEventMap, AnyFunction, TelegramWebViewSendEventMap} from '../types';
import Button from './button';
import {ButtonMenuItemOptionsVerifiable} from './buttonMenu';
import confirmationPopup from './confirmationPopup';
import PopupElement from './popups';
import PopupPeer, {PopupPeerOptions} from './popups/peer';
import PopupPickUser from './popups/pickUser';
import TelegramWebView from './telegramWebView';
import wrapAttachBotIcon from './wrappers/attachBotIcon';
import getPeerTitle from './wrappers/getPeerTitle';
import wrapPeerTitle from './wrappers/peerTitle';

const SANDBOX_ATTRIBUTES = [
  'allow-scripts',
  'allow-same-origin',
  'allow-popups',
  'allow-forms',
  'allow-modals',
  'allow-storage-access-by-user-activation'
].join(' ');

export type WebAppLaunchOptions = {
  webViewResultUrl: WebApp['webViewResultUrl'],
  webViewOptions: WebApp['webViewOptions'],
  attachMenuBot?: AttachMenuBot,
  cacheKey?: string
};

export default class WebApp {
  private telegramWebView: TelegramWebView;
  private webViewResultUrl: Awaited<ReturnType<AppAttachMenuBotsManager['requestWebView']>>;
  private webViewOptions: Parameters<AppAttachMenuBotsManager['requestWebView']>[0];
  private attachMenuBot: AttachMenuBot;
  private mainButton: HTMLElement;
  private isCloseConfirmationNeeded: boolean;
  private lastHeaderColor: TelegramWebViewEventMap['web_app_set_header_color'];
  private showSettingsButton: boolean;
  private readyResult: TelegramWebViewEventMap['iframe_ready'];
  private reloadTimeout: number;
  private iconElement: HTMLElement;
  private listenerSetter: ListenerSetter;
  private destroyed: boolean;
  // private mainButtonText: HTMLElement;

  public header: HTMLElement;
  public title: HTMLElement;
  public body: HTMLElement;
  public footer: HTMLElement;
  private forceHide: () => void;
  private onBackStatus: (visible: boolean) => void;

  private managers: AppManagers;

  public cacheKey: string;

  constructor(options: WebAppLaunchOptions & {
    header: WebApp['header'],
    title: WebApp['title'],
    body: WebApp['body'],
    footer: WebApp['footer'],
    forceHide: WebApp['forceHide'],
    onBackStatus: WebApp['onBackStatus']
  }) {
    safeAssign(this, options);

    this.listenerSetter = new ListenerSetter();
    this.managers = rootScope.managers;

    this.title.classList.add('web-app-title');
    this.header.classList.add('web-app-header');
    this.body.classList.add('web-app-body');
    this.footer.classList.add('web-app-footer');

    this.mainButton = Button('btn-primary btn-color-primary web-app-button', {noRipple: true});
    // this.mainButtonText = document.createElement('span');
    // this.mainButton.append(this.mainButtonText);
    // this.body.append(this.mainButton);
    this.footer.append(this.mainButton);
    this.body.after(this.footer);

    attachClickEvent(this.mainButton, () => {
      this.telegramWebView.dispatchWebViewEvent('main_button_pressed', undefined);
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

  protected setupMainButton = ({
    is_visible,
    is_active,
    is_progress_visible,
    color,
    text,
    text_color
  }: TelegramWebViewEventMap['web_app_setup_main_button']) => {
    is_visible = is_visible && !!text?.trim();
    if(text) this.mainButton.replaceChildren(wrapEmojiText(text));
    if(color) themeController.applyAppColor({
      name: 'primary-color',
      element: this.mainButton,
      hex: color,
      darkenAlpha: 0.04
    });
    if(text_color) this.mainButton.style.color = text_color;
    // this.mainButton.classList.toggle('is-visible', is_visible);
    this.footer.classList.toggle('is-visible', is_visible);
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

  protected createWebView() {
    const telegramWebView = this.telegramWebView = new TelegramWebView({
      url: this.webViewResultUrl.url,
      sandbox: SANDBOX_ATTRIBUTES,
      allow: 'camera; microphone; geolocation;',
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
        safeWindowOpen(url);
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
      web_app_setup_main_button: this.setupMainButton,
      web_app_setup_back_button: this.setupBackButton,
      web_app_setup_settings_button: this.setupSettingsButton,
      web_app_setup_closing_behavior: ({need_confirmation}) => this.isCloseConfirmationNeeded = !!need_confirmation,
      web_app_open_popup: this.debouncePopupMethod(this.openPopup, 'popup_closed', {}),
      web_app_open_scan_qr_popup: () => telegramWebView.dispatchWebViewEvent('scan_qr_popup_closed', {}),
      web_app_read_text_from_clipboard: async({req_id}) => {
        const result: TelegramWebViewSendEventMap['clipboard_text_received'] = {
          req_id
        };

        let data: string;
        if(this.attachMenuBot && !this.attachMenuBot.pFlags.inactive) try {
          const permission = await navigator.permissions.query({
            // @ts-ignore
            name: 'clipboard-read'
          });

          if(permission.state === 'granted') {
            data = await navigator.clipboard.readText();
          }
        } catch(error) {
          console.error('clipboard read error', error);
        }

        if(data !== undefined) {
          result.data = data;
        }

        telegramWebView.dispatchWebViewEvent('clipboard_text_received', result);
      },
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
          error: error?.cause
        });
      }
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

  public async getTitle<T extends boolean>(plain: T): Promise<T extends true ? string : HTMLElement> {
    if(!this.attachMenuBot) {
      const peerId = this.getPeerId();
      if(plain) return getPeerTitle({peerId, plainText: true});
      else return wrapPeerTitle({peerId}) as any;
    } else {
      if(plain) return this.attachMenuBot.short_name as any;
      else return wrapEmojiText(this.attachMenuBot.short_name) as any;
    }
  }

  public async init(mountCallback: () => MaybePromise<void>) {
    if(!this.attachMenuBot) {
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

    if(hasIcon) {
      this.iconElement.classList.add('web-app-icon');
    } else {
      this.iconElement = undefined;
    }

    const telegramWebView = this.createWebView();
    this.setBodyColor(this.getThemeParams().bg_color);
    this.setHeaderColor({color_key: 'bg_color'});
    this.body.prepend(...[this.iconElement, telegramWebView.iframe].filter(Boolean));

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

      if(err.cause === 'QUERY_ID_INVALID') {
        this.forceHide();
      } else {
        console.error('web app prolong error', err);
      }
    });
  }
}
