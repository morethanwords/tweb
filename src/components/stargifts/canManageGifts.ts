import rootScope from '@lib/rootScope';

export async function getCanManagePeerGifts(peerId: PeerId): Promise<boolean> {
  if(peerId === rootScope.myId) return true
  return peerId.isAnyChat() && rootScope.managers.appChatsManager.hasRights(peerId.toChatId(), 'post_messages')
}
