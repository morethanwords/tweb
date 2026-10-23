import {StoryAlbum} from '@layer';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import ListenerSetter from '@helpers/listenerSetter';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from '@components/buttonMenu';
import CheckboxField from '@components/checkboxField';
import createSubmenuTrigger from '@components/createSubmenuTrigger';
import InputField from '@components/inputField';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';

// * asks for a name and makes an album of it, with these stories in it when given
export async function openCreateAlbumPopup(peerId: PeerId, storyIds?: number[]): Promise<number | undefined> {
  const managers = bindManagersToSession(rootScope.managers);
  const inputField = new InputField({
    maxLength: 64,
    placeholder: 'Stories.Albums.CreatePlaceholder',
    required: true
  });

  try {
    await confirmationPopup({
      titleLangKey: 'Stories.Albums.CreateTitle',
      inputField,
      button: {langKey: 'Create'}
    });
  } catch(e) {
    return;
  }

  const album = await managers.appStoriesManager.createAlbum(peerId, inputField.value, storyIds);
  return album.album_id;
}

// * "Add to Album": the albums of the peer, each checked when every one of the stories is in it, and
// * clicking one puts them in or takes them out. `onCreateAlbum` puts "New Album" first
export function createAddToAlbumSubmenuTrigger(options: {
  // * read when the submenu opens: a menu built once serves whichever story it is opened on
  getPeerId: () => PeerId,
  getStoryIds: () => number[],
  getAlbums: () => MaybePromise<StoryAlbum[]>,
  verify: ButtonMenuItemOptionsVerifiable['verify'],
  onCreateAlbum?: () => void,
  listenerSetter?: ListenerSetter
}) {
  const managers = bindManagersToSession(rootScope.managers);
  return createSubmenuTrigger({
    options: {
      icon: 'folder',
      text: 'Stories.Albums.AddToAlbum',
      verify: options.verify
    },
    createSubmenu: async() => {
      const peerId = options.getPeerId();
      const storyIds = options.getStoryIds();
      const [stories, albums] = await Promise.all([
        managers.appStoriesManager.getStoriesById(peerId, storyIds),
        options.getAlbums()
      ]);

      const buttons: ButtonMenuItemOptions[] = (albums || []).map((album) => {
        const checkboxField = new CheckboxField({
          checked: stories.every((story) => {
            return story?._ === 'storyItem' && !!story.albums?.includes(album.album_id);
          })
        });

        const span = document.createElement('span');
        span.classList.add('stories-album-title');
        span.append(wrapEmojiText(album.title));

        return {
          textElement: span,
          onClick: () => {
            const wasChecked = checkboxField.checked;
            checkboxField.checked = !wasChecked;
            managers.appStoriesManager.updateAlbum(peerId, album.album_id, {
              [wasChecked ? 'deleteStories' : 'addStories']: storyIds
            }).catch(() => {
              checkboxField.checked = wasChecked;
              toastNew({langPackKey: 'Error.AnError'});
            });
          },
          checkboxField,
          noCheckboxClickListener: true,
          keepOpen: true
        };
      });

      if(options.onCreateAlbum) {
        buttons.unshift({
          icon: 'folder_add',
          text: 'Stories.Albums.CreateTitle',
          onClick: options.onCreateAlbum
        });
      }

      return ButtonMenuSync({buttons, listenerSetter: options.listenerSetter});
    }
  });
}
