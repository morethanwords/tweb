/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Button from '../../button';
import Row from '../../row';
import {Authorization} from '../../../layer';
import {formatDateAccordingToTodayNew} from '../../../helpers/date';
import {ButtonMenuSync} from '../../buttonMenu';
import {toast} from '../../toast';
import I18n from '../../../lib/langPack';
import PopupPeer from '../../popups/peer';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import {SliderSuperTabEventable} from '../../sliderTab';
import findAndSplice from '../../../helpers/array/findAndSplice';
import {attachContextMenuListener} from '../../../helpers/dom/attachContextMenuListener';
import positionMenu from '../../../helpers/positionMenu';
import contextMenuController from '../../../helpers/contextMenuController';
import SettingSection from '../../settingSection';
import PopupElement from '../../popups';

export default class AppActiveSessionsTab extends SliderSuperTabEventable {
  public authorizations: Authorization.authorization[];
  private menuElement: HTMLElement;

  public init() {
    this.container.classList.add('active-sessions-container');
    this.setTitle('SessionsTitle');

    const Session = (auth: Authorization.authorization) => {
      const row = new Row({
        title: [auth.app_name, auth.app_version].join(' '),
        subtitle: [auth.ip, auth.country].filter(Boolean).join(' - '),
        clickable: true,
        titleRight: auth.pFlags.current ? undefined : formatDateAccordingToTodayNew(new Date(Math.max(auth.date_active, auth.date_created) * 1000))
      });

      row.container.dataset.hash = '' + auth.hash;

      row.midtitle.textContent = [auth.device_model, auth.system_version || auth.platform].filter(Boolean).join(', ');

      return row;
    };

    const authorizations = this.authorizations.slice();

    {
      const section = new SettingSection({
        name: 'CurrentSession',
        caption: 'ClearOtherSessionsHelp'
      });

      const auth = findAndSplice(authorizations, (auth) => auth.pFlags.current);
      const session = Session(auth);

      section.content.append(session.container);

      if(authorizations.length) {
        const btnTerminate = Button('btn-primary btn-transparent danger', {icon: 'stop', text: 'TerminateAllSessions'});
        attachClickEvent(btnTerminate, (e) => {
          PopupElement.createPopup(PopupPeer, 'revoke-session', {
            buttons: [{
              langKey: 'Terminate',
              isDanger: true,
              callback: () => {
                const toggle = toggleDisability([btnTerminate], true);
                this.managers.apiManager.invokeApi('auth.resetAuthorizations').then((value) => {
                  // toggleDisability([btnTerminate], false);
                  btnTerminate.remove();
                  otherSection.container.remove();
                }, onError).finally(() => {
                  toggle();
                });
              }
            }],
            titleLangKey: 'AreYouSureSessionsTitle',
            descriptionLangKey: 'AreYouSureSessions'
          }).show();
        }, {listenerSetter: this.listenerSetter});

        section.content.append(btnTerminate);
      }

      this.scrollable.append(section.container);
    }

    if(!authorizations.length) {
      return;
    }

    const otherSection = new SettingSection({
      name: 'OtherSessions',
      caption: 'SessionsListInfo'
    });

    authorizations.forEach((auth) => {
      otherSection.content.append(Session(auth).container);
    });

    this.scrollable.append(otherSection.container);

    const onError = (err: ApiError) => {
      if(err.type === 'FRESH_RESET_AUTHORISATION_FORBIDDEN') {
        toast(I18n.format('RecentSessions.Error.FreshReset', true));
      }
    };

    let target: HTMLElement;
    const onTerminateClick = () => {
      const hash = target.dataset.hash;

      PopupElement.createPopup(PopupPeer, 'revoke-session', {
        buttons: [{
          langKey: 'Terminate',
          isDanger: true,
          callback: () => {
            this.managers.apiManager.invokeApi('account.resetAuthorization', {hash})
            .then((value) => {
              if(value) {
                target.remove();
              }
            }, onError);
          }
        }],
        titleLangKey: 'AreYouSureSessionTitle',
        descriptionLangKey: 'TerminateSessionText'
      }).show();
    };

    const element = this.menuElement = ButtonMenuSync({
      buttons: [{
        icon: 'stop',
        text: 'Terminate',
        onClick: onTerminateClick
      }]
    });
    element.id = 'active-sessions-contextmenu';
    element.classList.add('contextmenu');

    document.getElementById('page-chats').append(element);

    attachContextMenuListener({
      element: this.scrollable.container,
      callback: (e) => {
        target = findUpClassName(e.target, 'row');
        if(!target || target.dataset.hash === '0') {
          return;
        }

        if(e instanceof MouseEvent) e.preventDefault();
        // smth
        if(e instanceof MouseEvent) e.cancelBubble = true;

        positionMenu(e, element);
        contextMenuController.openBtnMenu(element);
      },
      listenerSetter: this.listenerSetter
    });

    attachClickEvent(this.scrollable.container, (e) => {
      target = findUpClassName(e.target, 'row');
      if(!target || target.dataset.hash === '0') {
        return;
      }

      onTerminateClick();
    }, {listenerSetter: this.listenerSetter});
  }

  onCloseAfterTimeout() {
    this.menuElement?.remove();
    return super.onCloseAfterTimeout();
  }
}
