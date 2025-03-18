import {createEffect, createSignal, on, onCleanup, useContext} from 'solid-js';

import Space from '../../space';

import RangeInput from '../rangeInput';
import MediaEditorContext from '../context';
import useIsMobile from '../useIsMobile';

const ADJUST_TIMEOUT = 800;

export default function AdjustmentsTab() {
  const context = useContext(MediaEditorContext);
  const {adjustments} = context;
  const [, setIsAdjusting] = context.isAdjusting;

  const isMobile = useIsMobile();

  let timeoutId = 0;
  function removeIsAdjusting() {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      setIsAdjusting(false);
    }, ADJUST_TIMEOUT);
  }

  return (
    <>
      <Space amount="16px" />
      {adjustments.map((item) => {
        const [value, setValue] = item.signal;
        const [container, setContainer] = createSignal<HTMLDivElement>();

        const [showGhost, setShowGhost] = createSignal(false);

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
                setIsAdjusting(true);
                removeGhost();
                removeIsAdjusting();
              }}
              label={item.label()}
              onChangeFinish={(prevValue, currentValue) => {
                setShowGhost(false);
                setIsAdjusting(false);
                context.pushToHistory({
                  undo() {
                    setValue(prevValue);
                  },
                  redo() {
                    setValue(currentValue);
                  }
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
