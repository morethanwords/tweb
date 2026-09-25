export type RichMessageAttachMenuAction =
  | 'visualMedia'
  | 'audio'
  | 'document'
  | 'location'
  | 'groupCollage'
  | 'groupSlideshow'
  | 'editMedia'
  | 'giftPremium'
  | 'poll'
  | 'standaloneChecklist'
  | 'attachBot';

const RICH_MESSAGE_ATTACH_MENU_ACTIONS = new Set<RichMessageAttachMenuAction>([
  'visualMedia',
  'audio',
  'location',
  'groupCollage',
  'groupSlideshow'
]);

// This describes actions that add PageBlocks to the expanded editor. In
// particular, standaloneChecklist is the messageMediaToDo flow; editor task
// lists are inserted from the formatting toolbar instead.
export function isRichMessageAttachMenuActionAllowed(
  action?: RichMessageAttachMenuAction
) {
  return !!action && RICH_MESSAGE_ATTACH_MENU_ACTIONS.has(action);
}

export function canShowAttachMenuAction(
  action: RichMessageAttachMenuAction | undefined,
  richMessageEditorExpanded: boolean
) {
  return (
    !richMessageEditorExpanded ||
    isRichMessageAttachMenuActionAllowed(action)
  );
}
