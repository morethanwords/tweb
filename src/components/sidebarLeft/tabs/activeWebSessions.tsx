import {Component, onMount} from 'solid-js';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import toggleDisability from '@helpers/dom/toggleDisability';
import {WebAuthorization} from '@layer';
import {avatarNew} from '@components/avatarNew';
import Button from '@components/button';
import confirmationPopup from '@components/confirmationPopup';
import Row from '@components/row';
import SettingSection from '@components/settingSection';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppActiveWebSessionsTab} from '@components/solidJsTabs/tabs';

const ActiveWebSessions: Component = () => {
  const [tab] = useSuperTab<typeof AppActiveWebSessionsTab>();
  const promiseCollector = usePromiseCollector();
  const sessions = tab.payload;

  const Session = async(auth: WebAuthorization) => {
    const peerId = auth.bot_id.toPeerId();
    const row = new Row({
      title: await wrapPeerTitle({peerId}),
      subtitle: [auth.ip, auth.region].join(' - '),
      clickable: true,
      titleRight: formatDateAccordingToTodayNew(new Date(Math.max(auth.date_active, auth.date_created) * 1000))
    });

    const media = row.createMedia('big');
    const avatar = avatarNew({
      middleware: tab.middlewareHelper.get(),
      size: 48,
      peerId
    });
    await avatar.readyThumbPromise;
    media.append(avatar.node);

    row.container.dataset.hash = '' + auth.hash;
    row.container.dataset.peerId = '' + peerId;

    row.midtitle.textContent = [auth.domain, auth.browser, auth.platform].filter(Boolean).join(', ');

    return row;
  };

  onMount(() => {
    tab.container.classList.add('active-sessions-container');
  });

  promiseCollector.collect((async() => {
    {
      const section = new SettingSection({
        caption: 'ClearOtherWebSessionsHelp'
      });

      const btnTerminate = Button('btn-primary btn-transparent danger', {icon: 'stop', text: 'TerminateAllWebSessions'});

      attachClickEvent(btnTerminate, async() => {
        await confirmationPopup({
          descriptionLangKey: 'AreYouSureWebSessions',
          button: {
            langKey: 'Disconnect',
            isDanger: true
          }
        });

        const toggle = toggleDisability([btnTerminate], true);
        tab.managers.appSeamlessLoginManager.resetWebAuthorizations().then(() => {
          toggle();
          tab.close();
        });
      }, {listenerSetter: tab.listenerSetter});

      section.content.append(btnTerminate);

      tab.scrollable.append(section.container);
    }

    {
      const section = new SettingSection({
        name: 'OtherWebSessions',
        caption: 'TerminateWebSessionInfo'
      });

      const rows = await Promise.all(sessions.map(Session));
      section.content.append(...rows.map((row) => row.container));

      let leftLength = rows.length;
      attachClickEvent(section.content, async(e) => {
        const row = findUpClassName(e.target, 'row');
        if(!row) {
          return;
        }

        await confirmationPopup({
          descriptionLangKey: 'TerminateWebSessionText',
          descriptionLangArgs: [await wrapPeerTitle({peerId: row.dataset.peerId.toPeerId()})],
          button: {
            langKey: 'Disconnect',
            isDanger: true
          }
        });

        const hash = row.dataset.hash;
        row.classList.add('is-disabled');
        tab.managers.appSeamlessLoginManager.resetWebAuthorization(hash).then(() => {
          if(!--leftLength) {
            tab.close();
          } else {
            row.remove();
          }
        });
      }, {listenerSetter: tab.listenerSetter});

      tab.scrollable.append(section.container);
    }
  })());

  return null;
};

export default ActiveWebSessions;
