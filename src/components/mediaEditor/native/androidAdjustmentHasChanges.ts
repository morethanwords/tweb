import {adjustmentsConfig, areNativeCurvesEnabled} from '@components/mediaEditor/adjustments';
import type {EditingMediaState} from '@components/mediaEditor/context';

/** Android 21f7d109 PhotoFilterView.hasChanges (775–795): scalar/tint values
 * compare to lastState (or zero), curves to identity, and blur is not tested. */
export default function androidAdjustmentHasChanges(current: EditingMediaState['adjustments'], entry?: EditingMediaState['adjustments']) {
  return adjustmentsConfig.some(({key}) => (current[key] || 0) !== (entry?.[key] || 0)) ||
    (current.native?.tintHighlights || 0) !== (entry?.native?.tintHighlights || 0) ||
    (current.native?.tintShadows || 0) !== (entry?.native?.tintShadows || 0) ||
    !!areNativeCurvesEnabled(current.native);
}
