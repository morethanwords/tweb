import {Accessor, createMemo, createRenderEffect, createRoot, createSignal, For, getOwner, runWithOwner, Show, untrack} from 'solid-js';
import {insert} from 'solid-js/web';
import type {AnyDialog} from '@lib/storages/dialogs';
import type {MonoforumDialog} from '@lib/storages/monoforumDialogs';
import type {Middleware} from '@helpers/middleware';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';
import FolderTag, {FOLDER_TAG_MORE_COLOR} from '@components/folderTags/folderTag';
import {fitFolderTags, getFolderTagMoreText, measureFolderTag} from '@components/folderTags/layout';
import {
  getDialogFolderTags,
  getFolderTagColor,
  useChatListNarrow,
  useFolderTagFilters,
  useFolderTagsShown
} from '@stores/folderTags';

/** The row's height in a chat list when its folder tags make it a line taller - see `.has-folder-tags` */
export const DIALOG_WITH_FOLDER_TAGS_HEIGHT = 82;

/**
 * Where the tags line starts and ends in a row of the chat list: the avatar's lane on the start,
 * the row's padding on the end (`.chatlist-chat.row-with-padding`, `.row-big`)
 */
const DIALOG_FOLDER_TAGS_INSET = 72 + 12;

/** What a folder's chat list hands its rows for their tags */
export type DialogFolderTagsContext = {
  /** the folder the list shows - its own tag is left out, the tab says it already */
  filterId: number,
  /** how wide a row of the list is */
  width: Accessor<number>
};

export type DialogFolderTags = {
  /** what the row knows of its chat: the folders it is in are read off the dialog's indexes */
  setDialog: (dialog: AnyDialog | MonoforumDialog) => void,
  /** whether the row shows tags, and is a line taller for it */
  hasTags: Accessor<boolean>
};

/**
 * Gives a row of a folder's chat list its line of folder tags, under the message, the way the
 * other clients put it: one tag for every other folder with a colour the chat is in, as many as the
 * row has room for and a "+N" for the rest. A row with tags is a line taller (`hasTags`) - the list
 * lays it out at `DIALOG_WITH_FOLDER_TAGS_HEIGHT` instead of its usual height.
 */
export default function attachDialogFolderTags({
  listEl,
  after,
  context,
  middleware
}: {
  listEl: HTMLElement,
  after: HTMLElement,
  context: DialogFolderTagsContext,
  middleware: Middleware
}): DialogFolderTags {
  return createRoot((dispose) => {
    middleware.onClean(dispose);

    const shown = useFolderTagsShown();
    const filters = useFolderTagFilters();
    const narrow = useChatListNarrow();
    const [dialog, setDialog] = createSignal<AnyDialog | MonoforumDialog>(undefined, {equals: false});

    const tags = createMemo(() => {
      if(!shown() || narrow()) {
        return [];
      }

      const _dialog = dialog();
      return isDialog(_dialog) ? getDialogFolderTags(_dialog, filters(), context.filterId) : [];
    });

    const hasTags = createMemo(() => !!tags().length);

    const fitted = createMemo(() => {
      const widths = tags().map((filter) => measureFolderTag(filter.title));
      return fitFolderTags(widths, context.width() - DIALOG_FOLDER_TAGS_INSET);
    });

    const visibleTags = createMemo(() => tags().slice(0, fitted().visible));

    // * the line is put in the row the first time it has a tag, and stays: most rows never get one
    let container: HTMLElement;
    const mountContainer = () => {
      container = document.createElement('div');
      container.classList.add('dialog-folder-tags');
      after.after(container);
      insert(container, () => (
        <>
          <For each={visibleTags()}>
            {(filter) => <FolderTag color={getFolderTagColor(filter)} title={filter.title} />}
          </For>
          <Show when={fitted().more}>
            <FolderTag color={FOLDER_TAG_MORE_COLOR}>{getFolderTagMoreText(fitted().more)}</FolderTag>
          </Show>
        </>
      ));
    };

    // * owned by the root rather than by the effect, which would take the line's contents down
    // * with it the next time it runs
    const owner = getOwner();
    createRenderEffect(() => {
      const _hasTags = hasTags();
      listEl.classList.toggle('has-folder-tags', _hasTags);
      if(_hasTags && !container) {
        untrack(() => runWithOwner(owner, mountContainer));
      }
    });

    return {
      setDialog,
      hasTags
    };
  });
}
