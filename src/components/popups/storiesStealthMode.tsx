import showFeatureDetailsPopup, {FeatureDetailsButton} from '@components/popups/featureDetails';
import {i18n} from '@lib/langPack';
import {useAppConfig} from '@stores/appState';
import {wrapStoriesStealthModeDuration} from '@components/wrappers/wrapDuration';
import usePremium from '@stores/premium';
import PopupPremium from '@components/popups/premium';
import rootScope from '@lib/rootScope';
import tsNow from '@helpers/tsNow';
import {slowModeTimer} from '@components/chat/utils';
import {onCleanup} from 'solid-js';
import createFeatureDetailsIconSticker from '@components/featureDetailsIconSticker';

export default async function showStoriesStealthModePopup(props: {
  onActivate?: () => void,
  onClose?: () => void
} = {}) {
  const appConfig = useAppConfig();
  const isPremium = usePremium();

  const stealthMode = await rootScope.managers.appStoriesManager.getStealthMode();
  const getLeftCooldown = () => (stealthMode.cooldown_until_date || 0) - tsNow(true);

  const getButton = (): FeatureDetailsButton => {
    if(!isPremium()) {
      return {
        text: i18n('Stories.StealthMode.Unlock'),
        onClick: () => {
          PopupPremium.show({feature: 'stories'});
        }
      };
    } else if(getLeftCooldown() > 0) {
      const {element, dispose} = slowModeTimer(getLeftCooldown);
      onCleanup(dispose);
      return {
        text: i18n('Stories.StealthMode.Cooldown', [element])
      };
    } else {
      return {
        text: i18n('Stories.StealthMode.Button'),
        onClick: async() => {
          const needToActivate = (stealthMode.active_until_date || 0) <= tsNow(true);
          if(needToActivate) {
            await rootScope.managers.appStoriesManager.activateStealthMode();
          }

          props.onActivate?.();
        }
      };
    }
  };

  showFeatureDetailsPopup({
    rows: [
      {
        icon: 'backward_5',
        title: i18n('Stories.StealthMode.Row1.Title'),
        subtitle: i18n('Stories.StealthMode.Row1.Subtitle', [
          wrapStoriesStealthModeDuration(appConfig.stories_stealth_past_period)
        ])
      },
      {
        icon: 'forward_25',
        title: i18n('Stories.StealthMode.Row2.Title'),
        subtitle: i18n('Stories.StealthMode.Row2.Subtitle', [
          wrapStoriesStealthModeDuration(appConfig.stories_stealth_future_period)
        ])
      }
    ],
    sticker: {
      element: createFeatureDetailsIconSticker('eye2', 'background-gradient-avatar')
    },
    title: i18n('Stories.StealthMode.Title'),
    subtitle: i18n('Stories.StealthMode.Subtitle'),
    get buttons() {
      return [getButton()];
    },
    onClose: props.onClose
  });
}
