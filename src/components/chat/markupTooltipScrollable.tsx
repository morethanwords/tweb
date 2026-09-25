import Scrollable from '@components/scrollable2';
import {render} from 'solid-js/web';

export default function mountMarkupTooltipScrollable(options: {
  mount: HTMLElement,
  row: HTMLElement,
  onRef: (element: HTMLDivElement) => void
}) {
  return render(() => (
    <Scrollable
      axis="x"
      class="markup-tooltip-tools markup-tooltip-tools-regular"
      ref={options.onRef}
      relative
    >
      {options.row}
    </Scrollable>
  ), options.mount);
}
