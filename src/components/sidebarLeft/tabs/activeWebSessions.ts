/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {formatDateAccordingToTodayNew} from '../../../helpers/date';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import {WebAuthorization} from '../../../layer';
import {avatarNew} from '../../avatarNew';
import Button from '../../button';
import confirmationPopup from '../../confirmationPopup';
import Row from '../../row';
import SettingSection from '../../settingSection';
import {SliderSuperTabEventable} from '../../sliderTab';
import wrapPeerTitle from '../../wrappers/peerTitle';

export default class AppActiveWebSessionsTab extends SliderSuperTabEventable {
  public async init(sessions: WebAuthorization[]) {
    this.container.classList.add('active-sessions-container');
    this.setTitle('WebSessionsTitle');

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
        middleware: this.middlewareHelper.get(),
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
        this.managers.appSeamlessLoginManager.resetWebAuthorizations().then(() => {
          this.close();
        });
      }, {listenerSetter: this.listenerSetter});

      section.content.append(btnTerminate);

      this.scrollable.append(section.container);
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
        this.managers.appSeamlessLoginManager.resetWebAuthorization(hash).then(() => {
          if(!--leftLength) {
            this.close();
          } else {
            row.remove();
          }
        });
      }, {listenerSetter: this.listenerSetter});

      this.scrollable.append(section.container);
    }
  }
}
