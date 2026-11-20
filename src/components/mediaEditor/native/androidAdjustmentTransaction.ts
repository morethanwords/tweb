import {batch} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {EditingMediaState, MediaEditorContextValue} from '@components/mediaEditor/context';
import {defaultCurveLevels, defaultSelectiveBlur, nativeCurveChannels} from '@components/mediaEditor/adjustments';
import deepEqual from '@helpers/object/deepEqual';

type Adjustments = EditingMediaState['adjustments'];

// Missing native values and explicitly stored defaults render identically. Merely
// materializing a default curve/blur object is not an adjustment operation.
function values(adjustments: Adjustments): Adjustments {
  const native = adjustments.native;
  return {...adjustments, processingVersion: undefined, native: {
    tintShadows: native?.tintShadows || 0,
    tintHighlights: native?.tintHighlights || 0,
    blur: {...defaultSelectiveBlur, ...native?.blur},
    curves: Object.fromEntries(nativeCurveChannels.map(channel => [channel, native?.curves?.[channel] || defaultCurveLevels]))
  }};
}

/** Only Android adjustment controls use this transaction; ordinary history and
 * desktop edits do not opt in. The eligibility flag is fixed at document open.
 */
export default function androidAdjustmentTransaction(context: Pick<MediaEditorContextValue,
  'mediaState' | 'editorState' | 'actions' | 'canUseNativePhotoProcessing'>) {
  const {mediaState, editorState, actions} = context;
  let before: Adjustments;
  let last: Adjustments;
  const snapshot = () => structuredClone(unwrap(mediaState.adjustments));
  function begin() {
    if(before && last === mediaState.adjustments) return;
    before = snapshot();
    last = mediaState.adjustments;
  }
  return {
    begin,
    change(update: (draft: Adjustments) => void) {
      const next = snapshot();
      update(next);
      if(deepEqual(values(next), values(mediaState.adjustments))) return;
      begin();
      if(context.canUseNativePhotoProcessing && !next.processingVersion) next.processingVersion = 'android-photo-v1';
      batch(() => {
        mediaState.adjustments = next;
        last = mediaState.adjustments;
        editorState.isAdjusting = true;
      });
    },
    finish() {
      const oldValue = before;
      before = undefined;
      editorState.isAdjusting = false;
      // Checkpoint Cancel/Undo may have replaced the document during a gesture.
      if(!oldValue || last !== mediaState.adjustments) return;
      const newValue = snapshot();
      if(deepEqual(values(oldValue), values(newValue))) {
        mediaState.adjustments = oldValue;
      } else {
        actions.pushToHistory({path: ['adjustments'], oldValue, newValue});
      }
      last = undefined;
    }
  };
}
