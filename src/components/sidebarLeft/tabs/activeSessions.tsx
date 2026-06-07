import {Component, onCleanup, onMount} from 'solid-js';
import Button from '@components/button';
import Row from '@components/row';
import {Authorization} from '@layer';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {ButtonMenuSync} from '@components/buttonMenu';
import PopupPeer from '@components/popups/peer';
import findUpClassName from '@helpers/dom/findUpClassName';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import toggleDisability from '@helpers/dom/toggleDisability';
import findAndSplice from '@helpers/array/findAndSplice';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import positionMenu from '@helpers/positionMenu';
import contextMenuController from '@helpers/contextMenuController';
import SettingSection from '@components/settingSection';
import PopupElement from '@components/popups';
import {toastNew} from '@components/toast';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppActiveSessionsTab} from '@components/solidJsTabs/tabs';

const ActiveSessions: Component = () => {
  const [tab] = useSuperTab<typeof AppActiveSessionsTab>();

  let menuElement: HTMLElement;

  onMount(() => {
    tab.container.classList.add('active-sessions-container');

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

    const authorizations = tab.payload.authorizations.slice();

    const onError = (err: ApiError) => {
      if(err.type === 'FRESH_RESET_AUTHORISATION_FORBIDDEN') {
        toastNew({langPackKey: 'RecentSessions.Error.FreshReset'});
      }
    };

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
                tab.managers.apiManager.invokeApi('auth.resetAuthorizations').then((value) => {
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
        }, {listenerSetter: tab.listenerSetter});

        section.content.append(btnTerminate);
      }

      tab.scrollable.append(section.container);
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

    tab.scrollable.append(otherSection.container);

    let target: HTMLElement;
    const onTerminateClick = () => {
      const hash = target.dataset.hash;

      PopupElement.createPopup(PopupPeer, 'revoke-session', {
        buttons: [{
          langKey: 'Terminate',
          isDanger: true,
          callback: () => {
            tab.managers.appAccountManager.resetAuthorization(hash)
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

    const element = menuElement = ButtonMenuSync({
      buttons: [{
        icon: 'stop',
        text: 'Terminate',
        onClick: onTerminateClick
      }]
    });
    element.id = 'active-sessions-contextmenu';
    element.classList.add('contextmenu');

    document.body.append(element);

    attachContextMenuListener({
      element: tab.scrollable.container,
      callback: (e) => {
        target = findUpClassName(e.target, 'row');
        if(!target || target.dataset.hash === '0') {
          return;
        }

        if(e instanceof MouseEvent) e.preventDefault();
        if(e instanceof MouseEvent) e.cancelBubble = true;

        positionMenu(e, element);
        contextMenuController.openBtnMenu(element);
      },
      listenerSetter: tab.listenerSetter
    });

    attachClickEvent(tab.scrollable.container, (e) => {
      target = findUpClassName(e.target, 'row');
      if(!target || target.dataset.hash === '0') {
        return;
      }

      onTerminateClick();
    }, {listenerSetter: tab.listenerSetter});
  });

  onCleanup(() => {
    menuElement?.remove();
  });

  return null;
};

export default ActiveSessions;
