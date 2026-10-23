import {Document, MessageMedia, StoryItem} from '@layer';
import rootScope from '@lib/rootScope';
import {i18n} from '@lib/langPack';
import {useAppSettings} from '@stores/appSettings';
import usePremium from '@stores/premium';
import showFeatureDetailsPopup from '@components/popups/featureDetails';
import createFeatureDetailsIconSticker from '@components/featureDetailsIconSticker';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

export const STORY_QUALITY_ICON: Icon = 'image_original';

// * whether a story's video plays as it was posted or in the lower quality the server keeps beside it:
// * one's own stories always as posted, other people's with Premium and the setting on (iOS
// * StoryItemContentComponent, Android MessageMedia.getDocument). Reactive in a tracking scope
export function isStoryHighQuality(peerId: PeerId, storyItem: StoryItem.storyItem) {
  if(peerId === rootScope.myId || storyItem.pFlags.out) {
    return true;
  }

  const [appSettings] = useAppSettings();
  return usePremium()() && appSettings.stories.highQuality;
}

// * the file a story's video plays from, and the one its element falls back to: the lower version is
// * H.264, which plays where the original's HEVC does not
export function getStoryVideoDocuments(media: MessageMedia.messageMediaDocument, highQuality: boolean) {
  const doc = media.document as Document.document;
  const altDoc = media.alt_documents?.[0] as Document.document;
  return altDoc && !highQuality ? {doc: altDoc} : {doc, altDoc};
}

export function showStoryQualityUpgradePopup(onClose?: () => void) {
  showFeatureDetailsPopup({
    sticker: {
      element: createFeatureDetailsIconSticker(STORY_QUALITY_ICON, 'background-gradient-stories')
    },
    title: i18n('Story.UpgradeQuality.Title'),
    subtitle: i18n('Story.UpgradeQuality.Text'),
    rows: [],
    buttons: [{
      text: i18n('Story.UpgradeQuality.Action'),
      onClick: () => {
        hotReloadGuard.showPremiumPopup({feature: 'stories'});
      }
    }],
    onClose
  });
}
