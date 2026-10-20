import {createSignal} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import MediaHeader from '@components/mediaHeader';
import MemberTagPreview from '@components/memberTag/memberTagPreview';
import {IconTsx} from '@components/iconTsx';
import {wrapMemberTag} from '@components/wrappers/participantRank';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import showEditMemberTagPopup from '@components/popups/editMemberTag';
import {getMemberTagRole, MemberTagRole} from '@appManagers/utils/chats/memberTag';
import classNames from '@helpers/string/classNames';
import {I18nTsx} from '@helpers/solid/i18n';
import I18n, {LangPackKey} from '@lib/langPack';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import styles from '@components/popups/memberTagInfo.module.scss';

const TITLES: {[role in MemberTagRole]: LangPackKey} = {
  member: 'MemberTag.Info.TitleMember',
  admin: 'MemberTag.Info.TitleAdmin',
  owner: 'MemberTag.Info.TitleOwner'
};

const TEXTS: {[role in MemberTagRole]: LangPackKey} = {
  member: 'MemberTag.Info.TextMember',
  admin: 'MemberTag.Info.TextAdmin',
  owner: 'MemberTag.Info.TextOwner'
};

const PREVIEWS: {[role in MemberTagRole]: LangPackKey} = {
  member: 'MemberTag.Info.PreviewMember',
  admin: 'MemberTag.Info.PreviewAdmin',
  owner: 'MemberTag.Info.PreviewOwner'
};

export type MemberTagInfoPopupOptions = {
  chatId: ChatId,
  // * whose tag was clicked, the tag, and the colour it wore
  peerId: PeerId,
  rank: string,
  role: MemberTagRole
};

/**
 * What a tag is (desktop's TagInfoBox): whose it is and in which group, a member's tag beside an
 * admin's (or the owner's), and — when I may set mine — a button that does
 */
export default async function showMemberTagInfoPopup(options: MemberTagInfoPopupOptions) {
  const {chatId, peerId, rank, role} = options;
  const chatPeerId = chatId.toPeerId(true);
  // * the account it is asked on: it does not open once the tab is on another
  const managers = bindManagersToSession(rootScope.managers);

  const chat = apiManagerProxy.getChat(chatId);
  const isIn = !!chat && !(chat as {pFlags: {left?: true}}).pFlags.left;
  const canEditMine = isIn && await managers.appChatsManager.hasRights(chatId, 'edit_rank');
  const mine = canEditMine ? await managers.appProfileManager.getParticipant(chatId, rootScope.myId).catch((): undefined => undefined) : undefined;
  const myRank = (mine as {rank?: string})?.rank;

  createPopup(() => {
    const [show, setShow] = createSignal(true);
    const sideRole: MemberTagRole = role === 'owner' ? 'owner' : 'admin';

    const tag = wrapMemberTag({rank, role});
    tag.classList.add(styles.tag);

    const editMine = () => {
      setShow(false);
      showEditMemberTagPopup({chatId, peerId: rootScope.myId, rank: myRank, role: getMemberTagRole(mine)});
    };

    return (
      <PopupElement class={styles.popup} managers={managers} show={show()} closable old>
        <PopupElement.Header floating>
          <PopupElement.CloseButton />
        </PopupElement.Header>
        <PopupElement.Body class={styles.body}>
          <MediaHeader marginTop>
            <MediaHeader.Sticker
              size={80}
              element={(
                <div class={classNames(styles.logo, role !== 'member' && 'member-tag-' + role)}>
                  <IconTsx icon="tag" />
                </div>
              )}
            />
            <MediaHeader.Title>
              <I18nTsx key={TITLES[role]} />
            </MediaHeader.Title>
            <MediaHeader.Subtitle>
              <I18nTsx
                key={TEXTS[role]}
                args={[
                  tag,
                  <PeerTitleTsx peerId={peerId} onlyFirstName />,
                  <PeerTitleTsx peerId={chatPeerId} />
                ]}
              />
            </MediaHeader.Subtitle>
          </MediaHeader>
          <div class={styles.previews} aria-hidden="true">
            <MemberTagPreview
              class={styles.preview}
              chatPeerId={chatPeerId}
              peerId={peerId}
              rank={I18n.format(PREVIEWS.member, true)}
              role="member"
              cropped
            />
            <MemberTagPreview
              class={styles.preview}
              chatPeerId={chatPeerId}
              peerId={peerId}
              rank={I18n.format(PREVIEWS[sideRole], true)}
              role={sideRole}
              cropped
            />
          </div>
        </PopupElement.Body>
        <PopupElement.Footer class={styles.footer}>
          {canEditMine ? (
            <PopupElement.FooterButton
              langKey={myRank ? 'MemberTag.Info.EditMine' : 'MemberTag.Info.AddMine'}
              callback={editMine}
            />
          ) : (
            <>
              <div class={styles.adminsOnly}>
                <I18nTsx key="MemberTag.Info.AdminsOnly" />
              </div>
              <PopupElement.FooterButton langKey="MemberTag.Info.Understood" />
            </>
          )}
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
