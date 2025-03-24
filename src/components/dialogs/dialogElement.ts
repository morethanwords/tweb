export class DialogElement {
  public dom: {
    listEl: HTMLElement;
    avatarEl: HTMLElement;
    avatarWrapper: HTMLElement;
    titleRow: HTMLElement;
    subtitleRow: HTMLElement;
    pinnedBadge: HTMLElement;
    unreadBadge: HTMLElement;
    unreadAvatarBadge: HTMLElement;
    mentionsBadge: HTMLElement;
    reactionsBadge: HTMLElement;
    messagesCountBadge: HTMLElement;
  };
 
  public createMessagesCountBadge() {
    const badge = document.createElement('div');
    badge.className = 'dialog-messages-count-badge';
    this.dom.messagesCountBadge = badge;
    return badge;
  }

  public toggleBadgeByKey(key: 'pinnedBadge' | 'unreadBadge' | 'unreadAvatarBadge' | 'mentionsBadge' | 'reactionsBadge' | 'messagesCountBadge', show: boolean, isMounted: boolean, isBatch?: boolean) {
    const badge = this.dom[key];
    if(!badge) {
      return;
    }

    if(!isMounted) {
      if(show) {
        this.listEl.append(badge);
      }
      return;
    }

    SetTransition({
      element: badge,
      className: 'is-hidden',
      forwards: !show,
      duration: isBatch ? 0 : BADGE_TRANSITION_TIME
    });
  }
 