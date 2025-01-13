import {createEffect, createMemo, createSignal, Show, JSX} from 'solid-js';
import {render} from 'solid-js/web';
import type {Level} from 'hls.js';

import {ButtonMenuItemOptionsVerifiable} from '../../components/buttonMenu';
import ButtonMenuToggle from '../../components/buttonMenuToggle';
import deferredPromise from '../../helpers/cancellablePromise';

import {hlsInstancesByVideo} from '../hls/hlsInstancesByVideo';
import {HlsStandardResolutionHeight} from '../hls/types';
import {snapQualityHeight} from '../hls/snapQualityHeight';
import {i18n, LangPackKey} from '../langPack';

type QualityLevelsSwitchButtonProps = {
  video: HTMLVideoElement;
  skin: string;
};

type InternalQualityLevelsSwitchButtonProps = QualityLevelsSwitchButtonProps & {
  controlsRef: (value: QualityLevelsSwitchButtonControls) => void;
}

type QualityLevelsSwitchButtonControls = {
  loadQualityLevels: () => Promise<void>;
  isMenuOpen: () => boolean;
}

function QualityLevelsSwitchButton(props: InternalQualityLevelsSwitchButtonProps) {
  const [qualityLevelsMenuButtons, setQualityLevelsMenuButtons] = createSignal<ButtonMenuItemOptionsVerifiable[]>([]);

  const [selectedHeight, setSelectedHeight] = createSignal<HlsStandardResolutionHeight>();
  const [qualityLevelsLoaded, setQualityLevelsLoaded] = createSignal(false);

  const controls: QualityLevelsSwitchButtonControls = {
    loadQualityLevels: async() => {
      setQualityLevelsLoaded(true);
    },
    isMenuOpen: () => {
      return qualityLevelsButton().classList.contains('menu-open');
    }
  };

  props.controlsRef(controls);

  // Uncomment during development
  // createEffect(() => {
  //   setQualityLevelsLoaded(true);
  // });

  createEffect(() => {
    if(qualityLevelsLoaded()) (async() => {
      const options = await getButtonMenuQualityOptions(props.video, setSelectedHeight);
      setQualityLevelsMenuButtons(options);
    })();
  });

  createEffect(() => {
    if(qualityLevelsLoaded()) {
      qualityLevelsMenuButtons().forEach(btn => btn.icon = undefined);
      const selectedMenuButton = qualityLevelsMenuButtons().find(btn => btn.id === (selectedHeight() || 'auto'));
      if(selectedMenuButton) selectedMenuButton.icon = 'check';
    }
  });

  const qualityLevelsButton = createMemo(() => ButtonMenuToggle({
    icon: `settings ${props.skin}__button`,
    buttons: qualityLevelsMenuButtons(),
    direction: 'top-left'
  }));

  createEffect(() => {
    qualityLevelsButton()?.classList.add('checkable-button-menu');
  });

  return <Show when={qualityLevelsMenuButtons().length > 0}>{qualityLevelsButton()}</Show>;
}

export function createQualityLevelsSwitchButton(props: QualityLevelsSwitchButtonProps) {
  const element = document.createElement('div');
  let controls: QualityLevelsSwitchButtonControls;

  const dispose = render(
    () => (
      <QualityLevelsSwitchButton
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

export function ButtonMenuItemWithAuxiliaryText(mainText: LangPackKey, additionalText: JSX.Element) {
  return  (
    <span class="btn-menu-item-with-auxiliary-text">
      {i18n(mainText)}
      <span class="btn-menu-item-auxiliary-text">{additionalText}</span>
    </span>
  );
}

export function ButtonMenuItemQualityText(height: HlsStandardResolutionHeight) {
  return ButtonMenuItemWithAuxiliaryText(`Hls.ResolutionHeightName${height}`, `${height}p`);
}

async function getButtonMenuQualityOptions(
  video: HTMLVideoElement,
  onHeightSelect: (level?: HlsStandardResolutionHeight) => void
) {
  const hls = hlsInstancesByVideo.get(video);
  if(!hls) return [];

  const deferredLevels = deferredPromise<Level[]>()

  const {default: Hls} = await import('hls.js');

  if(hls.levels && hls.levels.length > 0) {
    deferredLevels.resolve(hls.levels);
  } else hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
    deferredLevels.resolve(data.levels);
  });

  const levels = await deferredLevels;

  const availableHeights = Array.from(new Set(levels.map(level => snapQualityHeight(level.height))))
  .sort((a, b) => b - a);

  const qualityButtons = availableHeights.map((height): ButtonMenuItemOptionsVerifiable => {
    const levelsOfThisHeight = levels.filter(level => snapQualityHeight(level.height) === height)
    .sort((a, b) => a.bitrate - b.bitrate);

    const onClick = () => {
      let optimalLevel = levelsOfThisHeight[0];
      for(const level of levelsOfThisHeight) {
        if(level.bitrate < hls.bandwidthEstimate) optimalLevel = level;
      }
      const idx = levels.indexOf(optimalLevel);

      hls.currentLevel = idx;
      onHeightSelect(height);
      // hls.autoLevelCapping = idx;
    }

    return {
      id: height,
      emptyIcon: true,
      regularText: ButtonMenuItemQualityText(height) as HTMLElement,
      onClick
    }
  });

  const result: ButtonMenuItemOptionsVerifiable[] = [
    {
      id: 'auto',
      text: 'Hls.ResolutionHeightAuto',
      emptyIcon: true,
      onClick: () => {
        hls.currentLevel = -1;
        onHeightSelect();
      // hls.autoLevelCapping = -1;
      }
    },
    ...qualityButtons
  ];

  return result;
}
