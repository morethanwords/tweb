import {createEffect, createSignal, on, onCleanup} from 'solid-js';

import Space from '../../space';

import {adjustmentsConfig} from '../adjustments';
import {useMediaEditorContext} from '../context';
import useIsMobile from '../useIsMobile';
import RangeInput from '../rangeInput';


const ADJUST_TIMEOUT = 800;

export default function AdjustmentsTab() {
  const {editorState, mediaState, actions} = useMediaEditorContext();

  const isMobile = useIsMobile();

  let timeoutId = 0;
  function removeIsAdjusting() {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      editorState.isAdjusting = false;
    }, ADJUST_TIMEOUT);
  }

  return (
    <>
      <Space amount="16px" />
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
