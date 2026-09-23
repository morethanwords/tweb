/**
 * What a multi-topic action bar can offer for the topics it has selected. An absent key is an
 * action that is not offered at all; the boolean is the direction it would take - `close: false`
 * reopens, `pin: false` unpins.
 */
export type TopicsSelectionActions = Partial<{
  read: boolean,
  mute: boolean,
  pin: boolean,
  close: boolean,
  hide: boolean,
  delete: boolean
}>;

/** One selected topic, in the terms the decision below is made in */
export type TopicSelectionState = {
  unread: boolean,
  muted: boolean,
  pinned: boolean,
  closed: boolean,
  hidden: boolean,
  /** the General topic: the one that cannot be deleted, and is hidden instead */
  general: boolean,
  /** whether we may pin, close or hide it (`dialogsStorage.canManageTopic`) */
  canManage: boolean,
  canDelete: boolean
};

/**
 * Which of the multi-topic actions a selection of topics can be offered, decided the way Android
 * decides it (`TopicsFragment.updateSelectedTopics`). A topic list is not a chat list: there is no
 * archive and no unread mark to put back, pinning is offered for one topic at a time, and closing
 * or hiding depends on what we may manage.
 */
export default function getTopicsSelectionActions(topics: TopicSelectionState[]): TopicsSelectionActions {
  const actions: TopicsSelectionActions = {};
  const count = topics.length;
  if(!count) {
    return actions;
  }

  let unread = 0, muted = 0, canPin = 0, canUnpin = 0,
    closed = 0, open = 0, canHide = 0, canShow = 0, canDelete = 0;
  for(const topic of topics) {
    if(topic.unread) ++unread;
    if(topic.muted) ++muted;
    if(topic.canDelete) ++canDelete;

    if(!topic.canManage) {
      continue;
    }

    // * a hidden topic is out of the list's order and out of its own state: it is neither pinned
    // * nor closed until it is shown again
    if(!topic.hidden) {
      if(topic.pinned) ++canUnpin;
      else ++canPin;

      if(topic.closed) ++closed;
      else ++open;
    }

    if(topic.general) {
      if(topic.hidden) ++canShow;
      else ++canHide;
    }
  }

  // * a topic has no unread mark of its own, so this only ever reads what is unread
  if(unread) actions.read = true;

  // * one muted topic is enough for the whole selection to be unmuted, the way Android puts it
  actions.mute = !muted;

  // * pinning is a move to the top of the list, so it is offered for one topic at a time
  if(canPin === 1 && !canUnpin) actions.pin = true;
  else if(canUnpin === 1 && !canPin) actions.pin = false;

  // * closing and reopening, on the other hand, are only offered when they are about all of them
  if(!closed && open) actions.close = true;
  else if(!open && closed) actions.close = false;

  if(count === 1) {
    if(canHide) actions.hide = true;
    else if(canShow) actions.hide = false;
  }

  if(canDelete === count) actions.delete = true;

  return actions;
}
