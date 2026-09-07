/*
 * The "New Call" screen — tdesktop's `PrepareCreateCallBox`
 * (calls_group_invite_controller.cpp:1126), as a left-sidebar tab.
 *
 * Pick nobody and confirm and you get an empty conference; pick one person and
 * you get a plain 1-on-1 call to them; pick several and you get a conference
 * they are all called into. Each person is picked with one of two buttons —
 * handset or camera — which is what decides whether they are called with video
 * (`ConfInviteRow`'s two elements, same file:75).
 */

import {For, onMount} from 'solid-js';
import {createStore} from 'solid-js/store';
import AppSelectPeers from '@components/appSelectPeers';
import ButtonCorner from '@components/buttonCorner';
import createInviteViaLinkRow from '@components/groupCall/inviteViaLinkRow';
import Button from '@components/buttonTsx';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import IS_CONFERENCE_CALL_SUPPORTED from '@environment/conferenceCallSupport';
import IS_GROUP_CALL_SUPPORTED from '@environment/groupCallSupport';
import appImManager, {ConferenceInviteRequest} from '@lib/appImManager';
import {i18n} from '@lib/langPack';
import noop from '@helpers/noop';
import {toastNew} from '@components/toast';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import showCallLinkPopup from '@components/call/callLinkPopup';
import styles from '@components/sidebarLeft/tabs/newCall.module.scss';

/** Handset + camera, the two ways to pick one person. */
function CallModeButtons(props: {
  video: boolean | undefined,
  onPick: (video: boolean) => void
}) {
  return (
    <div class={styles.modes}>
      <For each={[false, true]}>{(video) => (
        <Button.Icon
          noRipple
          icon={video ? 'videocamera' : 'phone'}
          class={props.video === video ? styles.picked : undefined}
          aria-label={i18n(video ? 'ConferenceCall.NewCall.VideoCallBack' : 'ConferenceCall.NewCall.CallBack').textContent}
          aria-pressed={props.video === video}
          tabIndex={0}
          // Native, not delegated: the selector cancels every click inside a
          // row to run its own toggle (appSelectPeers.ts:420), and a cancelled
          // event never reaches the document listener Solid delegates from.
          on:click={(e: MouseEvent) => {
            e.stopPropagation();
            props.onPick(video);
          }}
        />
      )}</For>
    </div>
  );
}

const NewCall = () => {
  const [tab] = useSuperTab();

  // How each picked person is called in, keyed by peer id. Shared rather than
  // per-row: a row can be selected and deselected by clicking the row itself,
  // and its buttons have to follow.
  const [modes, setModes] = createStore<Record<string, boolean>>({});
  // tdesktop's `_lastSelectWithVideo` — selecting a row without touching its
  // buttons reuses the mode the last explicit pick used.
  let lastPickedVideo = false;
  let selector: AppSelectPeers;

  const collect = (): ConferenceInviteRequest[] => {
    return selector.getSelected()
    .filter((key) => key.isPeerId())
    .map((key) => {
      const peerId = key.toPeerId();
      return {peerId, video: modes['' + peerId]};
    });
  };

  const confirm = () => {
    const invite = collect();
    tab.close();

    if(invite.length === 1) {
      // One person is not a conference — tdesktop rings them directly
      // (calls_group_invite_controller.cpp:1192).
      const {peerId, video} = invite[0];
      appImManager.callUser(peerId.toUserId(), video ? 'video' : 'voice').catch(noop);
      return;
    }

    appImManager.createConference({invite, confirm: false}).catch(noop);
  };

  const createLink = async() => {
    if(!IS_GROUP_CALL_SUPPORTED || !IS_CONFERENCE_CALL_SUPPORTED) {
      toastNew({langPackKey: 'ConferenceCall.Unsupported'});
      return;
    }

    try {
      const {link} = await tab.managers.appGroupCallsManager.createConferenceCallLink();
      tab.close();
      showCallLinkPopup({link, initial: true});
    } catch(err) {
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  onMount(() => {
    tab.container.classList.add('new-call-container');
    // The selector brings its own scrollable; the tab's default one would
    // otherwise sit empty on top of it (same as `addMembers`).
    tab.scrollable.container.remove();

    // Always visible: confirming with nothing picked is how you skip straight
    // to an empty conference.
    const btnNext = ButtonCorner({icon: 'arrow_next', className: 'is-visible'});
    tab.content.append(btnNext);
    attachClickEvent(btnNext, confirm, {listenerSetter: tab.listenerSetter});

    selector = new AppSelectPeers({
      middleware: tab.middlewareHelper.get(),
      appendTo: tab.content,
      managers: tab.managers,
      peerType: ['contacts'],
      exceptSelf: true,
      multiSelect: true,
      design: 'square',
      checkboxSide: 'left',
      // Selecting and deselecting also happens by clicking the row itself, and
      // that path knows nothing about the two buttons — reconcile the modes
      // here so a row-click deselect drops the highlight too.
      onChange: (_length, changes) => {
        for(const {key, add} of changes) {
          if(!key.isPeerId()) {
            continue;
          }

          const id = '' + key;
          if(!add) {
            setModes(id, undefined);
          } else if(modes[id] === undefined) {
            setModes(id, lastPickedVideo);
          }
        }
      },
      processElementAfter: (peerId, dialogElement) => {
        // A button on an already-selected row only switches the mode; only the
        // row itself deselects (tdesktop's `rowElementClicked`, same file:539).
        const pick = (withVideo: boolean) => {
          lastPickedVideo = withVideo;
          setModes('' + peerId, withVideo);
          if(!selector.selected.has(peerId)) {
            selector.add({key: peerId, scroll: false});
            // `add` owns the selection and the chip; the row's own checkbox is
            // a separate sync the row-click path does too.
            selector.toggleElementCheckboxByKey(peerId, true);
          }
        };

        dialogElement.container.classList.add(styles.row);
        dialogElement.container.append(wrapSolidComponent(
          () => <CallModeButtons video={modes['' + peerId]} onPick={pick} />,
          tab.middlewareHelper.get()
        ));
      }
    });

    // Not everyone worth calling is in the list, so the link is offered where
    // the picking happens — the same row the in-call invite picker prepends.
    selector.section.content.prepend(createInviteViaLinkRow({
      middleware: tab.middlewareHelper.get(),
      onClick: () => void createLink()
    }));
  });

  return <></>;
};

export default NewCall;
