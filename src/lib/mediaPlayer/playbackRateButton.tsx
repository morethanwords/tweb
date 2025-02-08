import {createEffect, createSignal} from 'solid-js';
import {render} from 'solid-js/web';

import {ButtonMenuItemOptionsVerifiable} from '../../components/buttonMenu';
import ButtonMenuToggle from '../../components/buttonMenuToggle';
import appMediaPlaybackController from '../../components/appMediaPlaybackController';
import Icon from '../../components/icon';

type PlaybackRateButtonProps = {
  skin: string;
  onMenuToggle: (open: boolean) => void;
};

type InternalPlaybackRateButtonProps = PlaybackRateButtonProps & {
  controlsRef: (value: PlaybackRateButtonControls) => void;
}

type PlaybackRateButtonControls = {
  setPlayBackRate: (value: number | ((val: number) => number)) => void;
  changeRateByAmount: (amount: number) => void;
  isMenuOpen: () => boolean;
}

const rates = [0.5, 1, 1.5, 2, 3];
const MAX_RATE = 5;

const geometricFontMap: Record<string, Icon> = {
  '0': 'geometric_digit_0',
  '1': 'geometric_digit_1',
  '2': 'geometric_digit_2',
  '3': 'geometric_digit_3',
  '4': 'geometric_digit_4',
  '5': 'geometric_digit_5',
  '6': 'geometric_digit_6',
  '7': 'geometric_digit_7',
  '8': 'geometric_digit_8',
  '9': 'geometric_digit_9',
  'x': 'geometric_letter_x',
  '.': 'geometric_dot'
};

function PlaybackRateButton(props: InternalPlaybackRateButtonProps) {
  const [selectedRate, setSelectedRate] = createSignal<number>(appMediaPlaybackController.playbackRate || 1);

  const controls: PlaybackRateButtonControls = {
    setPlayBackRate: setSelectedRate,
    changeRateByAmount: (amount) => {
      const newValue = selectedRate() + amount;
      if(newValue < 1) {
        setSelectedRate(0.5);
      } else {
        setSelectedRate(Math.min(MAX_RATE, Math.round(newValue - 0.01)));
      }
      appMediaPlaybackController.playbackRate = selectedRate();
    },
    isMenuOpen: () => {
      return playbackRateButton.classList.contains('menu-open');
    }
  };

  props.controlsRef(controls);

  const buttons: ButtonMenuItemOptionsVerifiable[] = rates.map((rate) => ({
    id: rate.toFixed(1),
    emptyIcon: true,
    onClick: () => {
      appMediaPlaybackController.playbackRate = rate;
      setSelectedRate(rate);
    },
    text: rate === 1 ? 'PlaybackRateNormal' : undefined,
    regularText: rate !== 1 ? rate + 'x' : undefined
  }));

  createEffect(() => {
    buttons.forEach((btn) => btn.icon = undefined);
    const button = buttons.find((btn) => btn.id === selectedRate().toFixed(1));
    if(button) button.icon = 'check';
  });

  createEffect(() => {
    const cls = 'playback-speed-icon-floating';
    playbackRateButton.querySelector(`.${cls}`)?.remove();

    const rateAsString = selectedRate().toFixed(1).replace(/\.0$/, 'x');

    const icons = rateAsString.split('').map((char) => ({
      char: char === '.' ? 'dot': char,
      icon: geometricFontMap[char]
    })).filter(Boolean);

    const rateElement = document.createElement('span');
    rateElement.classList.add(cls);

    rateElement.append(...icons.map((({char, icon}) => Icon(icon, 'geometric-font-icon', `geometric-font-icon--${char}`))));

    playbackRateButton.append(rateElement);
  });

  const playbackRateButton = ButtonMenuToggle({
    icon: `mediaspeed_empty ${props.skin}__button`,
    buttons,
    direction: 'top-left',
    onOpen: () => {
      props.onMenuToggle?.(true);
    },
    onClose: () => {
      props.onMenuToggle?.(false);
    }
  });

  createEffect(() => {
    playbackRateButton?.classList.add('checkable-button-menu', 'playback-rate-button-menu');
  });

  return <>{playbackRateButton}</>;
}

export function createPlaybackRateButton(props: PlaybackRateButtonProps) {
  const element = document.createElement('div');
  let controls: PlaybackRateButtonControls;

  const dispose = render(
    () => (
      <PlaybackRateButton
        controlsRef={(value) => {
          controls = value
        }}
        {...props}
      />
    ),
    element
  );

  return {
    element,
    get controls() {
      return controls;
    },
    dispose
  };
}
