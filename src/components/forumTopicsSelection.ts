import showDeleteDialogPopup from '@components/popups/deleteDialog';
import showPinLimitReached from '@components/showPinLimitReached';
import {
  DialogsSelectionBase,
  DialogsSelectionBaseOptions,
  DialogsSelectionMenuItem,
  MENU_ITEM_DELETE,
  MENU_ITEM_READ,
  MENU_ITEMS_MUTE,
  MENU_ITEMS_PIN
} from '@components/dialogsSelectionBase';
import {CAN_HIDE_TOPIC} from '@appManagers/constants';
import type {TopicsSelectionActions} from '@appManagers/utils/dialogs/topicsSelectionActions';
import {LangPackKey} from '@lib/langPack';

type TopicsSelectionAction = keyof TopicsSelectionActions;

/** Hiding the General topic is behind the same flag the row's own menu is behind */
const HIDE_ITEMS: DialogsSelectionMenuItem<TopicsSelectionAction>[] = CAN_HIDE_TOPIC ? [
  {action: 'hide', direction: true, icon: 'hide', text: 'Hide'},
  {action: 'hide', direction: false, icon: 'hide', text: 'EditTopicHide'}
] : [];

/**
 * What the bar's menu offers for topics, in the order Android puts these actions. A topic list has
 * neither an archive nor an unread mark to put back, and hiding is about the General topic alone -
 * so this is not the chat list's menu with items taken out, it is its own.
 */
const MENU_ITEMS: DialogsSelectionMenuItem<TopicsSelectionAction>[] = [
  MENU_ITEM_READ,
  ...MENU_ITEMS_PIN,
  ...MENU_ITEMS_MUTE,
  {action: 'close', direction: true, icon: 'lock', text: 'CloseTopic'},
  {action: 'close', direction: false, icon: 'lockoff', text: 'RestartTopic'},
  ...HIDE_ITEMS,
  MENU_ITEM_DELETE
];

/**
 * Selecting several topics of one forum at once, the way Android's `TopicsFragment` does it. The
 * bar and the selecting itself are `DialogsSelectionBase`; this is what a topic is and can take
 * (`appMessagesManager.getTopicsSelectionActions` decides the latter).
 *
 * One of these belongs to one open forum tab, and goes away with it.
 */
export default class ForumTopicsSelection extends DialogsSelectionBase<TopicsSelectionAction> {
  protected countLangKey: LangPackKey = 'TopicsSelected';

  constructor(options: DialogsSelectionBaseOptions) {
    super(options);

    // a topic row has no avatar to lay a checkbox over, so it makes room for one at its start
    this.hasCheckboxClassName = 'has-select-checkbox-start';

    // the forum tab titles itself smaller than the chat list does, and the bar stands in for it
    this.compactPlate = true;
  }

  /** The forum the topics belong to - a topic list is one peer's, and that peer is its filter id */
  private get peerId() {
    return this.getFilterId() as PeerId;
  }

  protected getMenuItems() {
    return MENU_ITEMS;
  }

  /** A topic of the forum's own list, and nothing else that may be rendered as a row beside them */
  public canSelect(element: HTMLElement) {
    return this.isRowOfList(element) &&
      !!element.dataset.threadId &&
      !element.dataset.mid;
  }

  protected async updateActions() {
    this.actions = await this.managers.appMessagesManager.getTopicsSelectionActions(this.peerId, this.getOrderedKeys());
  }

  protected async perform(action: TopicsSelectionAction, direction: boolean) {
    const peerId = this.peerId;
    const topicIds = this.getOrderedKeys();
    const {appMessagesManager} = this.managers;
    switch(action) {
      case 'read': {
        appMessagesManager.readTopics({peerId, topicIds});
        break;
      }

      case 'mute': {
        appMessagesManager.toggleDialogsMute({dialogs: topicIds.map((threadId) => ({peerId, threadId})), mute: direction});
        break;
      }

      case 'close': {
        appMessagesManager.toggleTopicsClosed({peerId, topicIds, closed: direction});
        break;
      }

      case 'hide': {
        appMessagesManager.editForumTopic({peerId, topicId: topicIds[0], hidden: direction});
        break;
      }

      case 'pin': {
        // * pinning is offered for one topic at a time, so it is that one topic that moves
        appMessagesManager.toggleDialogPin({peerId, topicOrSavedId: topicIds[0]})
        .catch((err: ApiError) => showPinLimitReached(err, {isTopic: true}));
        break;
      }

      case 'delete': {
        // * deleting a topic takes everything that was written in it, so it is asked about first. One
        // * topic is asked about by name with the very popup its own menu opens, which deletes it too
        if(topicIds.length === 1) {
          showDeleteDialogPopup(peerId, undefined, () => this.cancelSelection(), topicIds[0]);
          return false;
        }

        const checked = await this.confirmDeletion({
          titleLangKey: 'DeleteTopics',
          titleLangArgs: [topicIds.length],
          descriptionLangKey: 'DeleteSelectedTopics'
        });
        if(!checked) {
          return false;
        }

        appMessagesManager.deleteTopics({peerId, topicIds});
        break;
      }
    }
  }
}
