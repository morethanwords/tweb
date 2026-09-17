/*
 * Popups built on `showFeatureDetailsPopup`: a lottie header, a list of rows and one or two buttons.
 * They only reveal themselves once the sticker reports ready, so they need the lottie worker pool.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';

defineStories('Feature details', [
  {
    id: 'featureDetails/custom',
    title: 'Feature details — hand-built',
    open: async(ctx) => {
      const [{default: showFeatureDetailsPopup}, {i18n}] = await Promise.all([
        import('@components/popups/featureDetails'),
        import('@lib/langPack')
      ]);

      showFeatureDetailsPopup({
        sticker: {name: 'Diamond', size: 120},
        title: i18n('AppName'),
        subtitle: i18n('Chat.Message.Ad.Text', [i18n('Chat.Message.Sponsored.Link')]),
        rows: [
          {icon: 'lock', title: i18n('RevenueSharingAdsInfo1Title'), subtitle: i18n('RevenueSharingAdsInfo1Subtitle')},
          {icon: 'revenue', title: i18n('RevenueSharingAdsInfo2Title'), subtitle: i18n('RevenueSharingAdsInfo2Subtitle')}
        ],
        buttons: [{text: i18n('OK')}]
      });
    }
  },
  {
    id: 'aboutAd',
    title: 'About these ads',
    open: async(ctx) => {
      const {default: showAboutAdPopup} = await import('@components/popups/aboutAd');
      showAboutAdPopup();
    }
  },
  {
    id: 'noForwards',
    title: 'Disable sharing',
    open: async(ctx) => {
      const {default: showNoForwardsPopup} = await import('@components/popups/noForwards');
      showNoForwardsPopup(noop);
    }
  },
  {
    id: 'frozen',
    title: 'Account frozen',
    open: async(ctx) => {
      const [{default: showFrozenPopup}, {appState, setAppStateSilent}] = await Promise.all([
        import('@components/popups/frozen'),
        import('@stores/appState')
      ]);

      // The popup reads the freeze deadline and appeal link off the app config, and a live session
      // keeps its own — which has neither, because the account is not frozen. Fill just those two
      // in (never `freeze_since_date`, which is what would put the app itself in read-only mode).
      if(!appState.appConfig.freeze_appeal_url) {
        setAppStateSilent('appConfig', {
          ...appState.appConfig,
          freeze_appeal_url: 'https://t.me/spambot',
          freeze_until_date: 1719792000
        });
      }

      showFrozenPopup();
    }
  },
  {
    id: 'passkey',
    title: 'Passkey intro',
    open: async(ctx) => {
      const {default: showPasskeyPopup} = await import('@components/popups/passkey');
      showPasskeyPopup();
    }
  },
  {
    id: 'communityPrivateChat/group',
    title: 'Community — private group',
    open: async(ctx) => {
      const {default: showCommunityPrivateChat} = await import('@components/popups/communityPrivateChat');
      showCommunityPrivateChat({peerId: ctx.peer('supergroup'), memberCount: 250});
    }
  },
  {
    id: 'communityPrivateChat/channel',
    title: 'Community — private channel',
    open: async(ctx) => {
      const {default: showCommunityPrivateChat} = await import('@components/popups/communityPrivateChat');
      showCommunityPrivateChat({peerId: ctx.peer('channel'), canOpenChat: true});
    }
  }
]);
