import {createEffect, createMemo, createSignal, on, onCleanup, Show} from 'solid-js';

import {i18n} from '../../../lib/langPack';

import Space from '../../space';

import {adjustmentsConfig} from '../adjustments';
import {useCropOffset} from '../canvas/useCropOffset';
import {useMediaEditorContext} from '../context';
import getResultSize from '../finalRender/getResultSize';
import RangeInput from '../rangeInput';
import StepInput, {StepInputStep} from '../stepInput';
import useIsMobile from '../useIsMobile';
import {availableQualityHeights, checkIfHasAnimatedStickers, snapToAvailableQuality} from '../utils';


const ADJUST_TIMEOUT = 800;

export default function AdjustmentsTab() {
  const {editorState, mediaState, actions, mediaSize, mediaType, imageRatio} = useMediaEditorContext();

  const isMobile = useIsMobile();
  const cropOffset = useCropOffset();

  let timeoutId = 0;
  function removeIsAdjusting() {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      editorState.isAdjusting = false;
    }, ADJUST_TIMEOUT);
  }

  const resultingSize = createMemo(() =>
    getResultSize({
      imageWidth: mediaSize[0],
      scale: mediaState.scale,
      newRatio: mediaState.currentImageRatio || imageRatio,
      videoType: mediaType === 'video' ? 'video' : 'gif',
      imageRatio,
      cropOffset: !cropOffset().width ? {width: 1, height: 1} : cropOffset()
    })
  );

  createEffect(() => {
    resultingSize();
    (window as any).debugResultingSize && console.log('resultingSize', resultingSize());
  });

  const maxVideoQuality = createMemo(() => snapToAvailableQuality(resultingSize()[1]));

  const steps = createMemo((): StepInputStep[] =>
    availableQualityHeights
    .filter(height => height <= maxVideoQuality())
    .map(height => ({value: height, label: height + 'p'}))
  );

  const canShowQualityInput = createMemo(() => (mediaType === 'video' || checkIfHasAnimatedStickers(mediaState.resizableLayers)) && steps().length > 1);

  return (
    <>
      <Space amount="16px" />

      <Show when={canShowQualityInput()}>
        <StepInput
          label={i18n('Quality')}
          steps={steps()}
          value={Math.min(maxVideoQuality(), mediaState.videoQuality)}
          onChange={(value) => void(mediaState.videoQuality = value)}
        />
        <Space amount="32px" />
      </Show>

      {adjustmentsConfig.map((item) => {
        const [container, setContainer] = createSignal<HTMLDivElement>();

        const [showGhost, setShowGhost] = createSignal(false);

        const value = () => mediaState.adjustments[item.key];
        const setValue = (v: number): void => void (mediaState.adjustments[item.key] = v);

        createEffect(
          on(showGhost, () => {
            if(!container() || !isMobile() || !showGhost()) return;
            const bcr = container().getBoundingClientRect();
            const div = (
              <div
                class="night media-editor__inherit-color"
                style={{
                  'position': 'fixed',
                  'left': bcr.left + 'px',
                  'top': bcr.top + 'px',
                  'width': bcr.width + 'px',
                  'height': bcr.height + 'px',
                  'z-index': 100
                }}
              >
                <RangeInput
                  value={value()}
                  onChange={() => {}}
                  label={item.label()}
                  min={item.to100 ? 0 : -50}
                  max={item.to100 ? 100 : 50}
                />
              </div>
            ) as HTMLDivElement;
            document.body.append(div);

            onCleanup(() => {
              setTimeout(() => {
                div.remove();
              }, 200);
            });
          })
        );

        let timeoutId = 0;
        const removeGhost = () => {
          window.clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            setShowGhost(false);
          }, ADJUST_TIMEOUT);
        };

        return (
          <>
            <RangeInput
              ref={setContainer}
              value={value()}
              onChange={(v) => {
                setValue(v);
                setShowGhost(true);
                editorState.isAdjusting = true;
                removeGhost();
                removeIsAdjusting();
              }}
              label={item.label()}
              onChangeFinish={(prevValue, currentValue) => {
                setShowGhost(false);
                editorState.isAdjusting = false;

                actions.pushToHistory({
                  path: ['adjustments', item.key],
                  newValue: currentValue,
                  oldValue: prevValue
                });
              }}
              min={item.to100 ? 0 : -50}
              max={item.to100 ? 100 : 50}
            />
            <Space amount="32px" />
          </>
        );
      })}
    </>
  );
}
