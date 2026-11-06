/*
 * A private chat's own wallpaper: the picker and the preview before it is applied.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {defineStories} from '../registry';
import {gradientWallPapers} from '../fixtures';

defineStories('Chat wallpaper', [
  {
    id: 'chatWallPaper',
    title: 'Chat wallpaper picker',
    managers: {
      appThemesManager: {getWallPapers: () => gradientWallPapers}
    },
    open: async(ctx) => {
      const {default: showChatWallPaperPopup} = await import('@components/popups/chatWallPaper');
      showChatWallPaperPopup({peerId: ctx.peer('private')});
    }
  },
  {
    id: 'chatWallPaperPreview',
    fixtureOnly: true,
    title: 'Chat wallpaper preview',
    open: async(ctx) => {
      const {default: showChatWallPaperPreviewPopup} = await import('@components/popups/chatWallPaperPreview');
      showChatWallPaperPreviewPopup({peerId: ctx.peer('private'), wallPaper: gradientWallPapers[1]});
    }
  },
  {
    id: 'chatWallPaperPreview/fromMessage',
    fixtureOnly: true,
    title: 'Chat wallpaper preview — the other side\'s',
    open: async(ctx) => {
      const {default: showChatWallPaperPreviewPopup} = await import('@components/popups/chatWallPaperPreview');
      showChatWallPaperPreviewPopup({
        peerId: ctx.peer('private'),
        wallPaper: gradientWallPapers[3],
        fromMessageId: 1
      });
    }
  },
  {
    id: 'chatWallPaperPreview/forWhom',
    title: 'Chat wallpaper — for me or for both',
    open: async(ctx) => {
      const {chooseChatWallPaperForWhom} = await import('@components/popups/chatWallPaperPreview');
      chooseChatWallPaperForWhom(ctx.peer('private'), bindManagersToSession(rootScope.managers));
    }
  },
  {
    id: 'chatWallPaperPreview/paidMessages',
    fixtureOnly: true,
    title: 'Chat wallpaper preview — someone who charges for messages',
    managers: {
      appPeersManager: {getStarsAmount: () => 10}
    },
    open: async(ctx) => {
      const {default: showChatWallPaperPreviewPopup} = await import('@components/popups/chatWallPaperPreview');
      showChatWallPaperPreviewPopup({peerId: ctx.peer('private'), wallPaper: gradientWallPapers[2]});
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
