import {createSignal, Show} from 'solid-js';
import {IconTsx} from '@components/iconTsx';
import MediaHeader from '@components/mediaHeader';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {StackedAvatarsTsx} from '@components/stackedAvatars';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import styles from '@components/call/conferenceJoinPopup.module.scss';

const MAX_NAMED_PARTICIPANTS = 3;

export type ConferenceJoinPopupOptions = {
  /** Who sent the invite, when the join started from one. */
  inviterPeerId?: PeerId,
  /** Peers the server listed as being in the call already. */
  participantPeerIds: PeerId[],
  /** Everyone in the call, including those the server didn't list. */
  participantsCount?: number
};

/**
 * "You are invited to join a Telegram Call" — the box tdesktop shows before a
 * conference join (`ConferenceCallJoinConfirm`, calls_group_common.cpp:136).
 * It answers the two questions a link alone doesn't: who is inviting you, and
 * who is already in there.
 *
 * Resolves when the call is joined, rejects when the popup is dismissed — the
 * same contract `confirmationPopup` has, so callers can keep awaiting it.
 */
export default async function showConferenceJoinPopup(options: ConferenceJoinPopupOptions): Promise<void> {
  const {participantPeerIds} = options;
  // Being invited by yourself is not information — tdesktop drops the inviter
  // in that case too (window_session_controller.cpp:1034).
  const inviterPeerId = options.inviterPeerId === rootScope.myId ? undefined : options.inviterPeerId;

  const invitation = inviterPeerId ?
    i18n('ConferenceCall.Join.TextInviter', [await wrapPeerTitle({peerId: inviterPeerId, onlyFirstName: true})]) :
    i18n('ConferenceCall.Join.Text');
  const alreadyJoined = await composeAlreadyJoined(participantPeerIds, options.participantsCount);

  return new Promise<void>((resolve, reject) => {
    const [show, setShow] = createSignal(false);
    let confirmed = false;

    createPopup(() => (
      <PopupElement
        class={styles.popup}
        show={show()}
        closable
        old
        onClose={() => {
          if(!confirmed) reject();
        }}
      >
        <PopupElement.Header class={styles.header}>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body class="text-overflow-wrap">
          <MediaHeader class={styles.mediaHeader}>
            <MediaHeader.Sticker
              size={80}
              element={(
                <div class={styles.logo}>
                  <IconTsx icon="phone_filled" />
                </div>
              )}
            />
            <MediaHeader.Title>{i18n('ConferenceCall.Join.Title')}</MediaHeader.Title>
            <MediaHeader.Subtitle secondary>{invitation}</MediaHeader.Subtitle>
          </MediaHeader>
          <Show when={alreadyJoined}>
            <div class={styles.separator} />
            <div class={styles.participants}>
              <StackedAvatarsTsx
                peerIds={participantPeerIds.slice(0, MAX_NAMED_PARTICIPANTS)}
                avatarSize={40}
              />
              {alreadyJoined}
            </div>
          </Show>
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton
            callback={() => {
              confirmed = true;
              resolve();
              setShow(false);
            }}
          >
            {i18n('ConferenceCall.Join.Button')}
          </PopupElement.FooterButton>
        </PopupElement.Footer>
      </PopupElement>
    ));

    queueMicrotask(() => setShow(true));
  });
}

/**
 * "A already joined this call." / "A and B …" / "A, B and C …" / "A, B and N
 * others …" — tdesktop names up to three people and counts the rest, where the
 * rest is measured against the call's full count rather than the page the
 * server happened to return.
 */
async function composeAlreadyJoined(peerIds: PeerId[], participantsCount = 0) {
  const known = peerIds.length;
  if(!known) {
    return;
  }

  const names = await Promise.all(
    peerIds.slice(0, MAX_NAMED_PARTICIPANTS).map((peerId) => wrapPeerTitle({peerId, onlyFirstName: true}))
  );

  let langPackKey: LangPackKey;
  let args: FormatterArguments;
  if(known <= MAX_NAMED_PARTICIPANTS) {
    langPackKey = ([
      'ConferenceCall.Join.AlreadyOne',
      'ConferenceCall.Join.AlreadyTwo',
      'ConferenceCall.Join.AlreadyThree'
    ] as LangPackKey[])[known - 1];
    args = names;
  } else {
    langPackKey = 'ConferenceCall.Join.AlreadyMany';
    args = [Math.max(known, participantsCount) - 2, names[0], names[1]];
  }

  return i18n(langPackKey, args);
}
