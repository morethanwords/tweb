import {StickerSet} from '@layer';
import ButtonIcon from '@components/buttonIcon';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import I18n, {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {appSettings, setAppSettings} from '@stores/appSettings';

const hiddenKey = (isEmoji?: boolean) => isEmoji ? 'hiddenGroupEmojiSets' as const : 'hiddenGroupSets' as const;

/** Whether the user collapsed the set the group currently offers in this chat. */
export function isGroupSetHidden(chatId: ChatId, set: StickerSet.stickerSet, isEmoji?: boolean) {
  return appSettings.stickers[hiddenKey(isEmoji)]?.['' + chatId] === '' + set.id;
}

/** Keyed by set, so a group swapping packs brings the section back on its own. */
export function setGroupSetHidden(
  chatId: ChatId,
  set: StickerSet.stickerSet,
  isEmoji: boolean,
  hidden: boolean
) {
  // the store merges objects rather than replacing them, so un-hiding has to write the key
  // as undefined — handing it a smaller object would leave the old entry in place
  setAppSettings('stickers', hiddenKey(isEmoji), {
    ['' + chatId]: hidden ? '' + set.id : undefined
  });
}

/** The set's own title, or the section name while the group offers nothing yet. */
export function getGroupSetTitle(set: StickerSet.stickerSet, isEmoji?: boolean) {
  return set ?
    wrapEmojiText(set.title) :
    i18n(isEmoji ? 'GroupEmojiPack' : 'GroupStickers');
}

/** Takes an admin from the panel straight to the screen that configures the group's set. */
export async function openGroupSetTab(chatId: ChatId, isEmoji: boolean) {
  // imported at click time: the panel lives under the chat input, which the sidebar imports
  const [{default: appSidebarRight}, {AppGroupStickersTab}] = await Promise.all([
    import('@components/sidebarRight'),
    import('@components/solidJsTabs/tabs')
  ]);

  // the panel stays usable with the tab open, so repeated taps must not stack copies of it.
  // The same tab serves both variants, hence the payload comparison rather than an
  // instance check alone.
  const current = appSidebarRight.getHistory().slice(-1)[0];
  if(
    current instanceof AppGroupStickersTab &&
    current.payload?.chatId === chatId &&
    !!current.payload?.isEmoji === isEmoji
  ) {
    appSidebarRight.toggleSidebar(true);
    return;
  }

  appSidebarRight.createTab(AppGroupStickersTab).open({chatId, isEmoji});
  appSidebarRight.toggleSidebar(true);
}

/**
 * The button tdesktop puts in the section header: an admin is taken to the setup screen,
 * everyone else collapses the section to the bottom of the panel (or brings it back).
 */
export function createGroupSetHeaderButton(options: {
  canEdit: boolean,
  hidden: boolean,
  isEmoji?: boolean,
  onClick: () => void
}) {
  const {canEdit, hidden} = options;
  const button = ButtonIcon(
    canEdit ? 'settings' : (hidden ? 'add' : 'hide'),
    {noRipple: true}
  );
  button.setAttribute('aria-label', I18n.format(
    canEdit ?
      (options.isEmoji ? 'GroupEmojiPack' : 'GroupStickers') :
      (hidden ? 'Show' : 'Hide'),
    true
  ));

  attachClickEvent(button, (event) => {
    event.stopPropagation();
    options.onClick();
  });

  return button;
}
