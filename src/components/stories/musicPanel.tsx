import {onCleanup} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import rootScope from '@lib/rootScope';
import createContextMenu from '@helpers/dom/createContextMenu';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import {IconTsx} from '@components/iconTsx';
import {toastNew} from '@components/toast';
import {addToProfileMusic, removeFromProfileMusic} from '@components/savedMusicActions';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import classNames from '@helpers/string/classNames';
import pillStyles from '@components/stories/storyPill.module.scss';
import styles from '@components/stories/musicPanel.module.scss';

/**
 * The pill is its own control, so the viewer's swipe/hold handler has to let its pointer events
 * through — otherwise the click never reaches the menu.
 */
export const STORY_MUSIC_PANEL_CLASS = styles.Wrapper;

/**
 * `storyItem.music` — the track the story was posted with, as a pill at the bottom of the caption
 * stack (iOS puts it under the text, Android calls it the caption's "bottom panel"). Clicking it
 * offers the same two saves both of them do: the profile playlist, or Saved Messages.
 */
export default function StoryMusicPanel(props: {
  doc: MyDocument,
  /** Pause / resume around the menu, shared with the story's other context menus. */
  menuOptions: Partial<Parameters<typeof createContextMenu>[0]>
}) {
  const {title, performer} = getAudioTitles(props.doc) || {} as ReturnType<typeof getAudioTitles>;

  const panel = (
    <div class={classNames(pillStyles.Pill, styles.Panel)}>
      <IconTsx icon="note_filled" class={styles.Icon} />
      <span class={styles.Text}>
        {performer && <span>{wrapEmojiText(performer)}</span>}
        {performer && title && <span class={styles.Separator}> • </span>}
        {title && <span class={styles.Title}>{wrapEmojiText(title)}</span>}
      </span>
    </div>
  ) as HTMLDivElement;

  // the toast waits for the send: announcing a save that never left the tab is worse than no toast
  const sendToSavedMessages = async() => {
    try {
      await rootScope.managers.appMessagesManager.sendFile({
        peerId: rootScope.myId,
        file: props.doc,
        isMedia: true
      });
    } catch(err) {
      toastNew({langPackKey: 'Error.AnError'});
      return;
    }

    toastNew({langPackKey: 'StoryAudioAddToSavedMessagesToast'});
  };

  const isInProfile = () => rootScope.managers.appSavedMusicManager.isInProfile(props.doc.id);

  const contextMenu = createContextMenu({
    buttons: [{
      icon: 'note_filled',
      text: 'SavedMusic.AddToProfile',
      onClick: () => addToProfileMusic(props.doc.id),
      verify: async() => !(await isInProfile())
    }, {
      icon: 'delete',
      text: 'SavedMusic.RemoveFromProfile',
      onClick: () => removeFromProfileMusic(props.doc.id),
      verify: isInProfile
    }, {
      icon: 'savedmessages',
      text: 'StoryAudioAddToSavedMessages',
      onClick: sendToSavedMessages
    }],
    listenTo: panel,
    listenForClick: true,
    ...props.menuOptions
  });

  onCleanup(() => {
    // close before destroy: destroying an OPEN menu only removes the menu itself and leaves
    // contextMenuController's full-screen overlay behind, swallowing every click from then on.
    // Reachable — the arrow keys still change or close the story while the menu is up.
    contextMenu.close();
    contextMenu.destroy();
  });

  return <div class={styles.Wrapper}>{panel}</div>;
}
