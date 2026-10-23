
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import ButtonMenuToggle, {ButtonMenuDirection} from '@components/buttonMenuToggle';
import Icon from '@components/icon';
import contextMenuController from '@helpers/contextMenuController';

// * the speeds a voice message, an audio or a story video steps through
export const PLAYBACK_RATES = [0.5, 1, 1.5, 2];
const PLAYBACK_RATES_ICONS: Icon[] = ['playback_05', 'playback_1x', 'playback_15', 'playback_2x'];

export const getPlaybackRateIcon = (rate: number) => {
  let idx = PLAYBACK_RATES.indexOf(rate);
  if(idx === -1) idx = PLAYBACK_RATES.indexOf(1);
  return PLAYBACK_RATES_ICONS[idx];
};

// * which item of a menu of PLAYBACK_RATES, in their order, is the speed playing: told to assistive technology
export const setPlaybackRateMenuState = (menu: HTMLElement, rate: number) => {
  menu.querySelectorAll('.btn-menu-item').forEach((item, index) => {
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(PLAYBACK_RATES[index] === rate));
  });
};

// * a speed as an item of a menu that checks the one playing: `icon: 'check'` on it
export const getPlaybackRateMenuButton = (rate: number): Omit<ButtonMenuItemOptionsVerifiable, 'onClick'> => ({
  id: rate.toFixed(1),
  emptyIcon: true,
  text: rate === 1 ? 'PlaybackRateNormal' : undefined,
  regularText: rate !== 1 ? rate + 'x' : undefined
});

export const PlaybackRateButton = (options: {
  onPlaybackRateMenuToggle?: (open: boolean) => void,
  direction: ButtonMenuDirection
}) => {
  let menuElement: HTMLElement, openCancelled = false;
  const updateMenuState = (menu: HTMLElement) => setPlaybackRateMenuState(menu, appMediaPlaybackController.playbackRate);
  const buttons: ButtonMenuItemOptionsVerifiable[] = PLAYBACK_RATES.map((rate) => ({
    regularText: rate + 'x',
    onClick: () => {appMediaPlaybackController.playbackRate = rate;}
  }));
  const button = ButtonMenuToggle({
    noIcon: true,
    // * a <button> with the a11y layer or without, as it was before the layer
    buttonOptions: {noRipple: true, asDiv: false, ariaLabel: 'AccDescr.PlaybackSpeed'},
    direction: options.direction,
    buttons,
    onOpenBefore: () => {
      openCancelled = false;
      if(menuElement) updateMenuState(menuElement);
      options.onPlaybackRateMenuToggle?.(true);
    },
    onOpen: (_, menu) => {
      menuElement = menu;
      menu.classList.add('playback-rate-menu');
      updateMenuState(menu);
    },
    onClose: () => options.onPlaybackRateMenuToggle?.(false),
    canOpen: () => !openCancelled
  });

  const setIcon = () => {
    const playbackRateButton = button;

    const icon = Icon(getPlaybackRateIcon(appMediaPlaybackController.playbackRate));
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

  // * the menu lives in the overlay root: it does not go away with whatever hides the button,
  // * and neither does one still being opened
  const closeMenu = () => {
    openCancelled = true;
    if(isMenuOpen()) contextMenuController.close();
  };

  setIcon();
  return {element: button, setIcon, addRate, isMenuOpen, closeMenu};
};
