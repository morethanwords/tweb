/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatTopbar from '@components/chat/topbar';
import Chat from '@components/chat/chat';
import {LangPackKey, i18n} from '@lib/langPack';
import {PeerSettings} from '@layer';
import {AppManagers} from '@lib/managers';
import callbackify from '@helpers/callbackify';
import ripple from '@components/ripple';
import confirmationPopup from '@components/confirmationPopup';
import classNames from '@helpers/string/classNames';
import {AckedResult} from '@lib/superMessagePort';
import {Accessor, createSignal, For, Show} from 'solid-js';
import TopbarPlate, {createTopbarPlate, TopbarPlateController} from '@components/chat/topbarPlate';

type ActionKey = keyof PeerSettings['pFlags'];

type ActionDef = {
  key: ActionKey,
  onClick: () => void,
  danger?: boolean
};

const LANG_KEY_MAP: {[key in ActionKey]?: LangPackKey} = {
  add_contact: 'AddContact',
  autoarchived: 'Unarchive',
  block_contact: 'BlockUser',
  report_spam: 'DeleteReportSpam'
};

export type ChatActionsPlate = TopbarPlateController & {
  set: (peerId: PeerId, settings: PeerSettings) => () => void,
  unset: (peerId: PeerId) => void,
  setPeerId: (peerId: PeerId) => Promise<AckedResult<() => void>>
};

function ActionsPlateBody(props: {
  buttons: Accessor<ActionDef[] | undefined>,
  disabled: Accessor<boolean>,
  onClose: () => void
}) {
  return (
    <TopbarPlate.Body class={classNames(props.disabled() && 'is-disabled')}>
      <Show when={props.buttons()}>
        {(btns) => (
          <For each={btns()}>
            {(action, i) => {
              const total = btns().length;
              const button = (
                <div
                  class={classNames(
                    'pinned-actions-button',
                    action.danger ? 'danger' : 'primary',
                    total > 1 && 'half',
                    total > 1 && (i() === 0 ? 'is-first' : 'is-last')
                  )}
                  onClick={() => action.onClick()}
                >
                  {(() => {
                    const text = i18n(LANG_KEY_MAP[action.key]);
                    text.classList.add('pinned-actions-button-text');
                    return text;
                  })()}
                </div>
              ) as HTMLElement;
              ripple(button);
              return button;
            }}
          </For>
        )}
      </Show>
      <div class="pinned-container-wrapper-utils pinned-actions-wrapper-utils">
        <TopbarPlate.CloseButton onClick={props.onClose} />
      </div>
    </TopbarPlate.Body>
  );
}

export default function createChatActionsPlate(
  topbar: ChatTopbar,
  chat: Chat,
  managers: AppManagers
): ChatActionsPlate {
  const [buttons, setButtons] = createSignal<ActionDef[] | undefined>();
  const [disabled, setDisabled] = createSignal(false);

  let currentPeerId: PeerId | undefined;
  let activeActions: ActionDef[] = [];

  const freeze = async(promise: Promise<any>) => {
    setDisabled(true);
    try {
      await promise;
    } catch(err) {

    }
    setDisabled(false);
  };

  const actions: ActionDef[] = [{
    key: 'autoarchived',
    onClick: async() => {
      const promise = managers.appMessagesManager.editPeerFolders([currentPeerId], 0);
      freeze(promise);
    }
  }, {
    key: 'block_contact',
    onClick: () => {
      topbar.blockUser(
        activeActions.some((action) => action.key === 'report_spam'),
        true,
        (promise) => freeze(promise)
      );
    },
    danger: true
  }, {
    key: 'add_contact',
    onClick: () => topbar.addContact()
  }, {
    key: 'report_spam',
    onClick: async() => {
      const peerId = currentPeerId;
      if(peerId.isUser()) {
        actions.find((action) => action.key === 'block_contact').onClick();
      } else {
        await confirmationPopup({
          titleLangKey: 'Chat.Confirm.ReportSpam.Header',
          descriptionLangKey: await managers.appPeersManager.isBroadcast(peerId) ?
            'Chat.Confirm.ReportSpam.Channel' :
            'Chat.Confirm.ReportSpam.Group',
          button: {langKey: 'ReportChat'}
        });

        const promise = Promise.all([
          managers.appMessagesManager.reportSpam(peerId),
          managers.appChatsManager.leave(peerId.toChatId())
        ]);
        freeze(promise);
      }
    },
    danger: true
  }];

  const onClose = () => {
    if(currentPeerId !== undefined) {
      managers.appProfileManager.hidePeerSettingsBar(currentPeerId);
    }
    unset(currentPeerId);
  };

  const plate = createTopbarPlate({
    modifier: 'actions',
    height: 52,
    onVisibilityChange: () => topbar.setFloating(),
    render: () => <ActionsPlateBody buttons={buttons} disabled={disabled} onClose={onClose} />
  });

  const unset = (peerId: PeerId) => {
    currentPeerId = peerId;
    activeActions = [];
    setButtons(undefined);
    plate.setHidden(true);
  };

  const set = (peerId: PeerId, settings: PeerSettings) => {
    const supportedActions = settings?.pFlags ?
      actions.filter((action) => settings.pFlags[action.key]) :
      [];
    if(!supportedActions.length) return () => unset(peerId);

    return () => {
      currentPeerId = peerId;
      activeActions = supportedActions;
      const filtered = supportedActions.slice(0, 2);
      setButtons(filtered);
      plate.setHidden(false);
      chat.bubbles.setPeerSettings(peerId, settings);
    };
  };

  const setPeerId = (peerId: PeerId) => {
    return Promise.all([
      managers.acknowledged.appProfileManager.getPeerSettings(peerId)
    ]).then(([peerSettingsAcked]) => {
      return {
        cached: peerSettingsAcked.cached,
        result: callbackify(peerSettingsAcked.result, (peerSettings) => set(peerId, peerSettings))
      };
    });
  };

  return {
    ...plate,
    set,
    unset,
    setPeerId
  };
}
