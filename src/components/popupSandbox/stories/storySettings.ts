import {defineStories} from '@components/popupSandbox/registry';
import {toastNew} from '@components/toast';
import type {StorySettings} from '@components/popups/storySettings';
import rootScope from '@lib/rootScope';
import {storyItem as fixtureStory} from '@components/popupSandbox/fixtures';

// Keep a local draft so reopening the story demonstrates saving and cancelling.
let saved: Partial<StorySettings>;
let published: StorySettings;

defineStories('Stories', [
  {
    id: 'storySettings',
    title: 'Story Settings',
    open: async() => {
      const {default: showStorySettingsPopup} = await import('@components/popups/storySettings');
      showStorySettingsPopup({
        initial: saved,
        onSave: (settings) => {
          saved = settings;
          toastNew({langPackKey: 'Saved'});
        }
      });
    }
  },
  {
    id: 'storySettings/published',
    title: 'Story Settings — published story',
    managers: (ctx) => ({
      appStoriesManager: {
        getPeerStories: () => ({stories: [fixtureStory]}),
        getStorySettings: () => published ?? {
          privacyType: 'contacts', everyoneExcept: [], contactsExcept: [ctx.peer('private')],
          closeFriends: [ctx.peer('private')], selectedContacts: [], hideFrom: [],
          allowScreenshots: false, keepOnPage: true
        },
        saveStorySettings: (_peerId: PeerId, _id: number, settings: StorySettings) => {
          published = settings;
          return {saved: true, applied: settings};
        }
      }
    }),
    open: async(ctx) => {
      const {showStorySettingsForStory} = await import('@components/popups/storySettings');
      const peerId = ctx.peer('self');
      const {stories} = await rootScope.managers.appStoriesManager.getPeerStories(peerId);
      const story = stories.find((story) => story._ === 'storyItem');
      if(!story) {
        toastNew({langPackKey: 'StorySettingsLoadError'});
        return;
      }
      await showStorySettingsForStory({peerId, storyId: story.id});
    }
  }
]);
