import {createEffect} from 'solid-js';
import PopupElement, {createPopup, usePopupContext} from '@components/popups/indexTsx';
import Section from '@components/section';
import {MemberTagFieldPreview} from '@components/memberTag/memberTagEditor';
import createMemberTagInputField from '@components/memberTag/memberTagField';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {toastNew} from '@components/toast';
import {cleanMemberTag, getMemberTagRole, MemberTagRole} from '@appManagers/utils/chats/memberTag';
import {I18nTsx} from '@helpers/solid/i18n';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import styles from '@components/popups/editMemberTag.module.scss';

export type EditMemberTagPopupOptions = {
  chatId: ChatId,
  peerId: PeerId,
  // * the tag and the role as the caller knows them; without a role the participant is asked for
  rank?: string,
  role?: MemberTagRole,
  onSaved?: (rank: string) => void
};

// * the field takes the caret once the popup is up (desktop): showing it takes the focus off
// * whatever had it, so not before
function FocusWhenShown(props: {element: HTMLElement}) {
  const context = usePopupContext();
  createEffect(() => {
    if(context.shown()) {
      setTimeout(() => props.element.focus(), 0);
    }
  });

  return null as null;
}

/**
 * "Edit tag" (desktop's EditCustomRankBox): the author's message with the tag on it, the field with
 * what the tag is for, and Save. An empty field saved removes the tag. Nothing changes before the
 * server has it
 */
export default async function showEditMemberTagPopup(options: EditMemberTagPopupOptions) {
  const {chatId, peerId} = options;
  // * the account it is asked on: it does not open once the tab is on another
  const managers = bindManagersToSession(rootScope.managers);
  let {rank, role} = options;
  if(!role) {
    const participant = await managers.appProfileManager.getParticipant(chatId, peerId).catch((): undefined => undefined);
    role = getMemberTagRole(participant);
    rank ??= participant && (participant as {rank?: string}).rank;
  }

  const isSelf = peerId === rootScope.myId;
  createPopup(() => {
    const inputField = createMemberTagInputField({role, value: rank});

    const save = async() => {
      const value = cleanMemberTag(inputField.value);
      if(value === (rank || '')) {
        return;
      }

      try {
        await managers.appChatsManager.editParticipantRank(chatId, peerId, value);
      } catch(err) {
        console.error('editChatParticipantRank failed', err);
        toastNew({langPackKey: 'Error.AnError'});
        return false;
      }

      options.onSaved?.(value);
    };

    return (
      <PopupElement class={styles.popup} managers={managers} closable initialFocus={() => inputField.input}>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title title="MemberTag.EditTitle" />
        </PopupElement.Header>
        <PopupElement.Body>
          <MemberTagFieldPreview
            class={styles.preview}
            chatPeerId={chatId.toPeerId(true)}
            peerId={peerId}
            role={role}
            inputField={inputField}
          />
          <Section
            caption={isSelf ?
              <I18nTsx key="MemberTag.AboutSelf" /> :
              <I18nTsx key="MemberTag.About" args={<PeerTitleTsx peerId={peerId} onlyFirstName />} />}
          >
            {inputField.container}
          </Section>
          <FocusWhenShown element={inputField.input} />
        </PopupElement.Body>
        <PopupElement.Footer>
          <PopupElement.FooterButton confirm langKey="Save" callback={save} />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
