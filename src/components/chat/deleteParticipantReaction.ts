import {Message, Reaction} from '@layer';
import {AppManagers} from '@lib/managers';
import rootScope from '@lib/rootScope';
import showDeleteMegagroupMessagesPopup from '@components/popups/deleteMegagroupMessages';

export default async function deleteParticipantReaction({
  message,
  participantPeerId,
  knownReaction,
  isMyReaction,
  managers,
  onConfirm
}: {
  message: Message.message | Message.messageService,
  participantPeerId: PeerId,
  knownReaction?: Reaction,
  isMyReaction?: boolean,
  managers: AppManagers,
  onConfirm?: () => void
}) {
  if(
    isMyReaction ||
    participantPeerId === rootScope.myId ||
    !await managers.appReactionsManager.canDeleteParticipantReactions(message.peerId)
  ) {
    return;
  }

  showDeleteMegagroupMessagesPopup({
    reaction: {
      message,
      participantPeerId,
      knownReaction
    },
    onConfirm
  });
  return true;
}
