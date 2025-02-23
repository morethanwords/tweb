import {createEffect, createMemo, createSignal, Show, JSX} from 'solid-js';
import {render} from 'solid-js/web';
import type {Level} from 'hls.js';

import {ButtonMenuItemOptionsVerifiable} from '../../components/buttonMenu';
import ButtonMenuToggle from '../../components/buttonMenuToggle';
import Icon from '../../components/icon';
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
      qualityLevelsMenuButtons().forEach((btn) => btn.icon = undefined);
      const selectedMenuButton = qualityLevelsMenuButtons().find((btn) => btn.id === (selectedHeight() || 'auto'));
      if(selectedMenuButton) selectedMenuButton.icon = 'check';
    }
  });

  const qualityLevelsButton = createMemo(() => ButtonMenuToggle({
    icon: `settings ${props.skin}__button checkable-button-menu quality-levels-switch-button`,
    buttons: qualityLevelsMenuButtons(),
    direction: 'top-left'
  }));

  createEffect(() => {
    qualityLevelsButton()?.append(HdSvg() as HTMLElement);
  });

  createEffect(() => {
    const isHd = selectedHeight() === 1080;

    qualityLevelsButton()?.querySelector('.tgico')?.replaceWith(Icon(isHd ? 'settings_clipped_corner' : 'settings'));
    qualityLevelsButton()?.classList.toggle('quality-levels-switch-button--is-hd', isHd);
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

  const deferredLevels = deferredPromise<Level[]>();

  const {default: Hls} = await import('hls.js');

  if(hls.levels && hls.levels.length > 0) {
    deferredLevels.resolve(hls.levels);
  } else hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
    deferredLevels.resolve(data.levels);
  });

  const levels = await deferredLevels;

  const availableHeights = Array.from(new Set(levels.map((level) => snapQualityHeight(level.height))))
  .sort((a, b) => b - a);

  const qualityButtons = availableHeights.map((height): ButtonMenuItemOptionsVerifiable => {
    const levelsOfThisHeight = levels.filter((level) => snapQualityHeight(level.height) === height)
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
    };
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

function HdSvg() {
  return (
    <svg class='quality-levels-switch-button__hd-icon' width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="14" height="10" rx="2" fill="currentColor"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M3.5 2.5C3.5 2.08579 3.16421 1.75 2.75 1.75C2.33579 1.75 2 2.08579 2 2.5V5V7.5C2 7.91421 2.33579 8.25 2.75 8.25C3.16421 8.25 3.5 7.91421 3.5 7.5V5.75H5V7.5C5 7.91421 5.33579 8.25 5.75 8.25C6.16421 8.25 6.5 7.91421 6.5 7.5V5V2.5C6.5 2.08579 6.16421 1.75 5.75 1.75C5.33579 1.75 5 2.08579 5 2.5V4.25H3.5V2.5ZM8.25 1.75C7.83579 1.75 7.5 2.08579 7.5 2.5V7.5C7.5 7.91421 7.83579 8.25 8.25 8.25H9.75C11.2688 8.25 12.5 7.01878 12.5 5.5V4.5C12.5 2.98122 11.2688 1.75 9.75 1.75H8.25ZM9.75 6.75H9V3.25H9.75C10.4404 3.25 11 3.80964 11 4.5V5.5C11 6.19036 10.4404 6.75 9.75 6.75Z" fill="black"/>
    </svg>
  );
}
