
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import ButtonMenuToggle, {ButtonMenuDirection} from '@components/buttonMenuToggle';
import Icon from '@components/icon';

export const PlaybackRateButton = (options: {
  onPlaybackRateMenuToggle?: (open: boolean) => void,
  direction: ButtonMenuDirection
}) => {
  const PLAYBACK_RATES = [0.5, 1, 1.5, 2];
  const PLAYBACK_RATES_ICONS: Icon[] = ['playback_05', 'playback_1x', 'playback_15', 'playback_2x'];
  let menuElement: HTMLElement;
  const updateMenuState = (menu: HTMLElement) => menu.querySelectorAll('.btn-menu-item').forEach((item, index) => {
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(PLAYBACK_RATES[index] === appMediaPlaybackController.playbackRate));
  });
  const button = ButtonMenuToggle({
    noIcon: true,
    buttonOptions: {noRipple: true, ariaLabel: 'AccDescr.PlaybackSpeed'},
    direction: options.direction,
    buttons: PLAYBACK_RATES.map((rate) => ({
      regularText: rate + 'x',
      onClick: () => {appMediaPlaybackController.playbackRate = rate;}
    })),
    onOpenBefore: () => {
      if(menuElement) updateMenuState(menuElement);
      options.onPlaybackRateMenuToggle?.(true);
    },
    onOpen: (_, menu) => {
      menuElement = menu;
      menu.classList.add('playback-rate-menu');
      updateMenuState(menu);
    },
    onClose: () => options.onPlaybackRateMenuToggle?.(false)
  });

  const setIcon = () => {
    const playbackRateButton = button;

    let idx = PLAYBACK_RATES.indexOf(appMediaPlaybackController.playbackRate);
    if(idx === -1) idx = PLAYBACK_RATES.indexOf(1);

    const icon = Icon(PLAYBACK_RATES_ICONS[idx]);
    if(playbackRateButton.firstElementChild) {
      playbackRateButton.firstElementChild.replaceWith(icon);
    } else {
      playbackRateButton.append(icon);
    }
  };

  const addRate = (add: number) => {
    const playbackRate = appMediaPlaybackController.playbackRate;
    const idx = PLAYBACK_RATES.indexOf(playbackRate);
    const nextIdx = idx + add;
    if(nextIdx >= 0 && nextIdx < PLAYBACK_RATES.length) {
      appMediaPlaybackController.playbackRate = PLAYBACK_RATES[nextIdx];
    }
  };

  const isMenuOpen = () => {
    return button.classList.contains('menu-open');
  };

  setIcon();
  return {element: button, setIcon, addRate, isMenuOpen};
};
