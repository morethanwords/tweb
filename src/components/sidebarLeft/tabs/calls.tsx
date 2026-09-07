/*
 * The Calls tab of the left sidebar — tdesktop's Calls section
 * (`calls/calls_box_controller.cpp`), rendered with tweb's own rows.
 *
 * Same three parts, top to bottom: the "Start New Call" action, the
 * client-side "Active video chats" block, and the call log itself — a peerless
 * `messages.search` for `inputMessagesFilterPhoneCalls`, paged by `offset_id`
 * and collapsed into rows by `groupCallLogMessages`.
 */

import {createEffect, createMemo, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {AvatarNewTsx} from '@components/avatarNew';
import Button from '@components/buttonTsx';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {IconTsx} from '@components/iconTsx';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {GrowHeightReveal} from '@helpers/solid/animations';
import PopupElement from '@components/popups';
import PopupDeleteMessages from '@components/popups/deleteMessages';
import confirmationPopup from '@components/confirmationPopup';
import {ChatType} from '@components/chat/chatType';
import {toastNew} from '@components/toast';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {AppSpeakersAndCameraTab} from '@components/solidJsTabs';
import {AppNewCallTab} from '@components/solidJsTabs/tabs';
import IS_CALL_SUPPORTED from '@environment/callSupport';
import IS_CONFERENCE_CALL_SUPPORTED from '@environment/conferenceCallSupport';
import IS_GROUP_CALL_SUPPORTED from '@environment/groupCallSupport';
import classNames from '@helpers/string/classNames';
import {formatFullSentTime, formatTime} from '@helpers/date';
import noop from '@helpers/noop';
import type {ActiveGroupCallEntry} from '@appManagers/appGroupCallsManager';
import appImManager from '@lib/appImManager';
import {i18n} from '@lib/langPack';
import {logger} from '@lib/logger';
import rootScope from '@lib/rootScope';
import {useAppConfig} from '@stores/appState';
import {
  CallLogGroup,
  CallLogMessage,
  groupCallLogMessages,
  isCallLogMessage
} from '@lib/calls/helpers/callLog';
import styles from '@components/sidebarLeft/tabs/calls.module.scss';

// tdesktop's constants are named `kFirstPageCount = 20` / `kPerPageCount = 100`
// but its request uses them the other way round — the first page is the 100
// (calls_box_controller.cpp:565). That is the behaviour worth copying: a first
// page of 20 collapses into so few rows that the second one keeps loading in
// view. Later pages stay at 100 for the same reason.
const PER_PAGE_COUNT = 100;

const CALL_LOG_FILTER = {_: 'inputMessagesFilterPhoneCalls'} as const;

const log = logger('CALLS-TAB');

function isToday(dateSec: number) {
  const a = new Date(dateSec * 1000);
  const b = new Date();
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/**
 * "12:30" today, "Yesterday at 12:30" the day before, "Feb 3 at 12:30" earlier —
 * tdesktop's `lng_call_box_status_*`, built out of tweb's own date helpers.
 * More than one call in the row prefixes the count, as every client does.
 */
function CallStatusText(props: {group: CallLogGroup}) {
  const time = () => {
    const {date} = props.group;
    return isToday(date) ? formatTime(new Date(date * 1000)) : formatFullSentTime(date);
  };

  return (
    <span class={styles.text}>
      {props.group.mids.length > 1 ?
        i18n('Calls.Status.Group', [props.group.mids.length, time()]) :
        time()}
    </span>
  );
}

function CallRow(props: {
  group: CallLogGroup,
  onDelete: (group: CallLogGroup) => void
}) {
  const isConference = () => props.group.conferenceMsgId !== undefined;

  const callBack = () => {
    const {group} = props;
    if(group.conferenceMsgId !== undefined) {
      // Conference rows re-enter the very call the invite belongs to, the way
      // the invite bubble does (bubbles.ts) and Android's call log does
      // (CallLogActivity.java:998) — tdesktop instead starts a plain 1-on-1
      // call with the inviter, which loses the call the row is about.
      appImManager.joinConference({
        _: 'inputGroupCallInviteMessage',
        msg_id: group.conferenceMsgId
      }, {inviterPeerId: group.peerId}).catch(noop);
      return;
    }

    appImManager.callUser(group.peerId.toUserId(), group.video ? 'video' : 'voice').catch(noop);
  };

  const showInChat = () => {
    appImManager.setInnerPeer({
      peerId: props.group.peerId,
      lastMsgId: props.group.mids[0]
    });
  };

  const canCallBack = () => props.group.peerId.isUser() && (
    isConference() ? IS_CONFERENCE_CALL_SUPPORTED : IS_CALL_SUPPORTED
  );

  return (
    <Row
      clickable={showInChat}
      role="button"
      tabIndex={0}
      contextMenu={{
        buttons: [{
          icon: 'message',
          text: 'Message.Context.Goto',
          onClick: showInChat
        }, {
          icon: 'delete',
          className: 'danger',
          text: 'Delete',
          onClick: () => props.onDelete(props.group)
        }]
      }}
    >
      <Row.Media size="abitbigger">
        <AvatarNewTsx peerId={props.group.peerId} size={42} isDialog />
      </Row.Media>
      <Row.Title class="text-bold">
        <PeerTitleTsx peerId={props.group.peerId} withIcons />
      </Row.Title>
      <Row.Subtitle>
        <span class={styles.status}>
          <IconTsx
            icon="arrow_next"
            class={classNames(
              styles.arrow,
              props.group.direction === 'out' && styles.out,
              props.group.direction === 'missed' && styles.missed
            )}
          />
          <CallStatusText group={props.group} />
        </span>
      </Row.Subtitle>
      <Show when={canCallBack()}>
        <Row.RightContent>
          <Button.Icon
            icon={isConference() ? 'group' : (props.group.video ? 'videocamera' : 'phone')}
            aria-label={i18n('CallBack').textContent}
            // An action of its own, not decoration inside the row — so unlike
            // most icon buttons it stays in the tab order.
            tabIndex={0}
            on:click={(e: MouseEvent) => {
              e.stopPropagation();
              callBack();
            }}
          />
        </Row.RightContent>
      </Show>
    </Row>
  );
}

/**
 * Chats whose group call is running right now. tdesktop shows the same block
 * above the log (calls_box_controller.cpp:848) and, like it, this reads the
 * cached chat list instead of asking the server.
 */
function ActiveGroupCalls() {
  const [tab] = useSuperTab();
  const [calls, setCalls] = createSignal<ActiveGroupCallEntry[]>([]);

  const update = () => {
    tab.managers.appGroupCallsManager.getActiveGroupCalls().then(setCalls, noop);
  };

  onMount(() => {
    update();
    tab.listenerSetter.add(rootScope)('chat_update', update);
    tab.listenerSetter.add(rootScope)('group_call_update', update);
  });

  return (
    // `appear={false}`: a list that is already loaded when the tab opens is
    // simply there — animating it would mean opening onto an empty block that
    // then grows. A call starting or ending later still slides the block open,
    // the way tdesktop toggles it (calls_box_controller.cpp:854).
    <GrowHeightReveal when={calls().length} appear={false}>
      <Section name="Calls.ActiveVideoChats" contentProps={{class: styles.list}}>
        <For each={calls()}>{(call) => (
          <Row
            clickable={() => appImManager.setInnerPeer({peerId: call.peerId})}
            role="button"
            tabIndex={0}
          >
            <Row.Media size="abitbigger">
              <AvatarNewTsx peerId={call.peerId} size={42} isDialog />
            </Row.Media>
            <Row.Title class="text-bold">
              <PeerTitleTsx peerId={call.peerId} withIcons />
            </Row.Title>
            <Row.Subtitle>
              {i18n(call.rtmp ? 'PeerInfo.Action.LiveStream' : 'PeerInfo.Action.VoiceChat')}
            </Row.Subtitle>
            <Row.RightContent>
              <Button.Icon
                icon={call.rtmp ? 'livestream' : 'videochat'}
                aria-label={i18n('VoiceChat.Topbar.Join').textContent}
                tabIndex={0}
                on:click={(e: MouseEvent) => {
                  e.stopPropagation();
                  // A stream is watched through the RTMP viewer; only a real
                  // video chat is joined as a participant.
                  const join = call.rtmp ?
                    appImManager.joinLiveStream(call.peerId) :
                    appImManager.joinGroupCall(call.peerId);
                  join.catch(noop);
                }}
              />
            </Row.RightContent>
          </Row>
        )}</For>
      </Section>
    </GrowHeightReveal>
  );
}

const Calls = () => {
  const [tab] = useSuperTab();
  const promiseCollector = usePromiseCollector();
  const appConfig = useAppConfig();

  const [messages, setMessages] = createSignal<CallLogMessage[]>([]);
  const [groups, setGroups] = createStore<{list: CallLogGroup[]}>({list: []});
  const [loaded, setLoaded] = createSignal(false);

  let loading = false;
  let offsetId = 0;

  const isEmpty = createMemo(() => loaded() && !groups.list.length);

  createEffect(() => {
    // Keyed reconcile so paging in older calls — or one arriving live — leaves
    // the rows that did not change (and their avatars) alone.
    setGroups('list', reconcile(groupCallLogMessages(messages()), {key: 'id', merge: false}));
  });

  const addMessages = (added: CallLogMessage[]) => {
    if(!added.length) {
      return;
    }

    setMessages((current) => {
      const byMid = new Map(current.map((message) => [message.mid, message]));
      added.forEach((message) => byMid.set(message.mid, message));
      // Calls only happen in private chats, whose message ids share one
      // account-wide sequence — which is what makes the peerless search's
      // `offset_id` paging work, and what orders the log.
      return Array.from(byMid.values()).sort((a, b) => b.mid - a.mid);
    });
  };

  const removeMessages = (peerId: PeerId, mids: Set<number>) => {
    setMessages((current) => {
      const next = current.filter((message) => !(message.peerId === peerId && mids.has(message.mid)));
      return next.length === current.length ? current : next;
    });
  };

  const loadMore = () => {
    if(loading || loaded()) {
      return;
    }

    loading = true;
    const promise = tab.managers.appMessagesManager.getHistory({
      inputFilter: CALL_LOG_FILTER,
      offsetId,
      limit: PER_PAGE_COUNT
    }).then((result) => {
      const found = result.messages || [];
      const last = found[found.length - 1];
      if(last) {
        // Advanced past every message of the page, call or not, so a service
        // message we do not render cannot stall the cursor.
        offsetId = last.mid;
      }

      // A short page is the end of the log — waiting for an empty one costs a
      // round trip during which the list still looks like it has more.
      if(found.length < PER_PAGE_COUNT) {
        setLoaded(true);
        tab.scrollable.onScrolledBottom = null;
      }

      addMessages(found.filter(isCallLogMessage));
    }, (error) => {
      // A failed page must not latch the list — the next scroll retries.
      log.error('loading the call log failed', error);
    }).finally(() => {
      loading = false;
      if(!loaded()) {
        tab.scrollable.checkForTriggers();
      }
    });

    promiseCollector.collect(promise);
  };

  const deleteGroup = (group: CallLogGroup) => {
    PopupElement.createPopup(
      PopupDeleteMessages,
      group.peerId,
      group.mids.slice(),
      ChatType.Chat
    );
  };

  const clearAll = async() => {
    let revoke: boolean;
    try {
      revoke = await confirmationPopup({
        titleLangKey: 'DeleteAllCalls',
        descriptionLangKey: 'DeleteAllCallsText',
        checkbox: {text: 'DeleteCallsForEveryone'},
        button: {langKey: 'Delete', isDanger: true}
      });
    } catch{
      return;
    }

    try {
      await tab.managers.appMessagesManager.deletePhoneCallHistory(revoke);
    } catch(error) {
      log.error('clearing the call log failed', error);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  onMount(() => {
    tab.container.classList.add('calls-container');

    const buttonMenu = ButtonMenuToggle({
      icon: 'more',
      direction: 'bottom-left',
      buttons: [{
        icon: 'settings',
        text: 'AccountSettings.SpeakersAndCamera',
        onClick: () => {
          tab.slider.createTab(AppSpeakersAndCameraTab).open();
        }
      }, {
        icon: 'delete',
        className: 'danger',
        text: 'DeleteAllCalls',
        onClick: clearAll,
        verify: () => !!groups.list.length
      }]
    });
    tab.header.append(buttonMenu);

    // A call that happens while the tab is open lands at the top, merging into
    // the row above it when it belongs there (tdesktop subscribes to
    // `MessageUpdate::NewAdded` for the same reason).
    tab.listenerSetter.add(rootScope)('history_multiappend', (message) => {
      if(isCallLogMessage(message)) {
        addMessages([message]);
      }
    });

    tab.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
      removeMessages(peerId, msgs);
    });

    tab.scrollable.onScrolledBottom = loadMore;
    loadMore();

    // The first page is collected by the slider, so it resolves while the tab
    // is still off screen — the `checkForTriggers` in `loadMore`'s `finally`
    // then measures a scrollable of zero height and fires nothing. Without
    // this kick a first page too short to overflow would never load a second.
    tab.shown.then(() => {
      if(!loaded()) {
        tab.scrollable.checkForTriggers();
      }
    });
  });

  onCleanup(() => {
    tab.scrollable.onScrolledBottom = null;
  });

  return (
    <>
      {/* Active calls sit above the create button, as in tdesktop
        * (calls_box_controller.cpp:856). */}
      <ActiveGroupCalls />
      <Show when={IS_CONFERENCE_CALL_SUPPORTED && IS_GROUP_CALL_SUPPORTED}>
        <Section
          caption={appConfig.conference_call_size_limit ? 'ConferenceCall.Create.Description' : undefined}
          captionArgs={[appConfig.conference_call_size_limit]}
        >
          <Row clickable={() => tab.slider.createTab(AppNewCallTab).open()} role="button" tabIndex={0}>
            <Row.Icon icon="phone_filled" />
            <Row.Title>{i18n('ConferenceCall.Create.Action')}</Row.Title>
          </Row>
        </Section>
      </Show>
      <Show when={groups.list.length}>
        <Section contentProps={{class: styles.list}}>
          <For each={groups.list}>{(group) => (
            <CallRow group={group} onDelete={deleteGroup} />
          )}</For>
        </Section>
      </Show>
      <Show when={isEmpty()}>
        <div class={styles.empty}>
          <div class={styles.emptyTitle}>{i18n('NoRecentCalls')}</div>
          <div class={styles.emptyDescription}>{i18n('NoRecentCallsInfo')}</div>
        </div>
      </Show>
    </>
  );
};

export default Calls;
