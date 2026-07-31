import {Component, onCleanup, onMount} from 'solid-js';
import {getOverlayRoot} from '@helpers/appWindow';
import Button from '@components/button';
import Row from '@components/row';
import {Authorization, ConnectedBot} from '@layer';
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
import {AppConnectedBotSessionTab, type AppActiveSessionsTab} from '@components/solidJsTabs/tabs';
import {avatarNew} from '@components/avatarNew';
import PeerTitle from '@components/peerTitle';
import rootScope from '@lib/rootScope';

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
      if(!auth.pFlags.current) {
        row.container.setAttribute('role', 'button');
        row.container.tabIndex = 0;
      }

      row.midtitle.textContent = [auth.device_model, auth.system_version || auth.platform].filter(Boolean).join(', ');

      return row;
    };

    const authorizations = tab.payload.authorizations.slice();
    const authorizationRows: HTMLElement[] = [];
    let connectedBot = tab.payload.connectedBot;
    const terminateConnectedBotKey = 'ChatAutomation.TerminateConnectedBot' as const;
    let renderTerminateButton: () => void;

    const onError = (err: ApiError) => {
      if(err.type === 'FRESH_RESET_AUTHORISATION_FORBIDDEN') {
        toastNew({langPackKey: 'RecentSessions.Error.FreshReset'});
      } else {
        toastNew({langPackKey: 'Error.AnError'});
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

      const btnTerminate = Button('btn-primary btn-transparent danger', {icon: 'stop', text: 'TerminateAllSessions'});
      renderTerminateButton = () => {
        if(authorizations.length || connectedBot) {
          if(!btnTerminate.parentElement) section.content.append(btnTerminate);
        } else {
          btnTerminate.remove();
        }
      };
      attachClickEvent(btnTerminate, (e) => {
        const connectedBotSnapshot = connectedBot;
        const connectedBotTitle = connectedBotSnapshot && new PeerTitle({
          peerId: (connectedBotSnapshot.bot_id as UserId).toPeerId(false),
          username: true
        });
        PopupElement.createPopup(PopupPeer, 'revoke-session', {
          buttons: [{
            langKey: 'Terminate',
            isDanger: true,
            callback: (e, selectedCheckboxes) => {
              const toggle = toggleDisability([btnTerminate], true);
              const terminateConnectedBot = !!connectedBotSnapshot &&
                selectedCheckboxes?.has(terminateConnectedBotKey);
              tab.managers.appAccountManager.resetAuthorizations().then((value) => {
                if(!value) {
                  toastNew({langPackKey: 'Error.AnError'});
                  return;
                }

                authorizationRows.forEach((row) => row.remove());
                authorizationRows.length = 0;
                authorizations.length = 0;
                renderTerminateButton();
                if(terminateConnectedBot) {
                  return tab.managers.appBusinessManager.updateConnectedBot({
                    previousBotId: connectedBotSnapshot.bot_id as UserId
                  });
                }

                if(!connectedBot) {
                  otherSection.container.remove();
                }
              }).catch(onError).finally(() => {
                toggle();
              });
            }
          }],
          titleLangKey: 'AreYouSureSessionsTitle',
          descriptionLangKey: 'AreYouSureSessions',
          checkboxes: connectedBotSnapshot ? [{
            text: terminateConnectedBotKey,
            textArgs: [connectedBotTitle.element]
          }] : undefined
        }).show();
      }, {listenerSetter: tab.listenerSetter});
      renderTerminateButton();

      tab.scrollable.append(section.container);
    }

    const otherSection = new SettingSection({
      name: 'OtherSessions',
      caption: 'SessionsListInfo'
    });

    const ConnectedBotSession = (bot: ConnectedBot.connectedBot) => {
      const botId = bot.bot_id as UserId;
      const title = new PeerTitle({peerId: botId.toPeerId(false)});
      const row = new Row({
        title: title.element,
        subtitleLangKey: 'ChatAutomation.Session',
        clickable: true,
        titleRight: bot.date ? formatDateAccordingToTodayNew(new Date(bot.date * 1000)) : undefined
      });
      row.container.dataset.businessBot = '' + botId;
      row.container.setAttribute('role', 'button');
      row.container.tabIndex = 0;
      row.midtitle.textContent = [bot.device, bot.location].filter(Boolean).join(', ');

      const avatar = avatarNew({
        middleware: tab.middlewareHelper.get(),
        peerId: botId.toPeerId(false),
        size: 40
      });
      row.applyMediaElement(avatar.node, '40');
      return row;
    };

    let connectedBotRow: HTMLElement;
    const renderConnectedBot = (bot?: ConnectedBot.connectedBot) => {
      const newRow = bot && ConnectedBotSession(bot).container;
      if(connectedBotRow) {
        if(newRow) connectedBotRow.replaceWith(newRow);
        else connectedBotRow.remove();
      } else if(newRow) {
        otherSection.content.prepend(newRow);
      }

      connectedBotRow = newRow;
      connectedBot = bot;
      renderTerminateButton();
      if(connectedBot && !otherSection.container.isConnected) {
        tab.scrollable.append(otherSection.container);
      } else if(!connectedBot && !authorizations.length) {
        otherSection.container.remove();
      }
    };

    if(connectedBot) {
      connectedBotRow = ConnectedBotSession(connectedBot).container;
      otherSection.content.append(connectedBotRow);
    }

    authorizations.forEach((auth) => {
      const row = Session(auth).container;
      authorizationRows.push(row);
      otherSection.content.append(row);
    });

    if(authorizations.length || connectedBot) {
      tab.scrollable.append(otherSection.container);
    }

    let target: HTMLElement;
    const onTerminateClick = () => {
      const sessionTarget = target;
      const businessBotId = sessionTarget.dataset.businessBot;
      if(businessBotId) {
        const botId = businessBotId as UserId;
        PopupElement.createPopup(PopupPeer, 'revoke-session', {
          buttons: [{
            langKey: 'Terminate',
            isDanger: true,
            callback: () => {
              tab.managers.appBusinessManager.updateConnectedBot({
                previousBotId: botId
              }).catch(onError);
            }
          }],
          titleLangKey: 'AreYouSureSessionTitle',
          descriptionLangKey: 'TerminateSessionText'
        }).show();
        return;
      }

      const hash = sessionTarget.dataset.hash;

      PopupElement.createPopup(PopupPeer, 'revoke-session', {
        buttons: [{
          langKey: 'Terminate',
          isDanger: true,
          callback: () => {
            tab.managers.appAccountManager.resetAuthorization(hash)
            .then((value) => {
              if(value) {
                sessionTarget.remove();
                const authorizationIndex = authorizations.findIndex((auth) => String(auth.hash) === hash);
                if(authorizationIndex !== -1) authorizations.splice(authorizationIndex, 1);

                const rowIndex = authorizationRows.indexOf(sessionTarget);
                if(rowIndex !== -1) authorizationRows.splice(rowIndex, 1);
                renderTerminateButton();

                if(!authorizations.length && !connectedBot) {
                  otherSection.container.remove();
                }
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

    getOverlayRoot().append(element);

    attachContextMenuListener({
      element: tab.scrollable.container,
      callback: (e) => {
        target = findUpClassName(e.target, 'row');
        if(!target || target.dataset.hash === '0' || (!target.dataset.hash && !target.dataset.businessBot)) {
          return;
        }

        if(!('touches' in e)) e.preventDefault(); // cross-realm-safe mouse check (Document PiP window)
        if(!('touches' in e)) e.cancelBubble = true;

        positionMenu(e, element);
        contextMenuController.openBtnMenu(element);
      },
      listenerSetter: tab.listenerSetter
    });

    const activateSession = (sessionTarget: HTMLElement) => {
      if(sessionTarget.dataset.businessBot) {
        const bot = connectedBot;
        if(bot && String(bot.bot_id) === sessionTarget.dataset.businessBot) {
          tab.slider.createTab(AppConnectedBotSessionTab).open({connectedBot: bot});
        }
        return;
      }

      target = sessionTarget;
      onTerminateClick();
    };

    attachClickEvent(tab.scrollable.container, (e) => {
      const sessionTarget = findUpClassName(e.target, 'row');
      if(
        !sessionTarget ||
        sessionTarget.dataset.hash === '0' ||
        (!sessionTarget.dataset.hash && !sessionTarget.dataset.businessBot)
      ) {
        return;
      }

      activateSession(sessionTarget);
    }, {listenerSetter: tab.listenerSetter});
    tab.listenerSetter.add(tab.scrollable.container)('keydown', (e) => {
      if(e.key !== 'Enter' && e.key !== ' ') return;

      const sessionTarget = findUpClassName(e.target, 'row');
      if(
        !sessionTarget ||
        sessionTarget.dataset.hash === '0' ||
        (!sessionTarget.dataset.hash && !sessionTarget.dataset.businessBot)
      ) {
        return;
      }

      e.preventDefault();
      activateSession(sessionTarget);
    });

    tab.listenerSetter.add(rootScope)('chat_automation_update', renderConnectedBot);
  });

  onCleanup(() => {
    menuElement?.remove();
  });

  return null;
};

export default ActiveSessions;
