import {createMemo, createSelector, For, JSX} from 'solid-js';
import clamp from '../../helpers/number/clamp';


export type StepInputStep<T = any> = {
  value: T;
  label: JSX.Element;
};

export default function StepInput<T = any>(props: {
  label: JSX.Element;
  value: T;
  steps: StepInputStep[];
  onChange: (value: T) => void;
}) {
  const stepIndex = createMemo(() => props.steps.findIndex(step => step.value === props.value));
  const step = createMemo(() => props.steps[stepIndex()]);

  const isActive = createSelector(stepIndex, (a, b) => a <= b);
  const isSelected = createSelector(stepIndex, (a, b) => a === b);

  return (
    <div
      class="media-editor__step-input"
    >
      <div class="media-editor__range-input-row">
        <div class="media-editor__range-input-label">{props.label}</div>
        <div class="media-editor__range-input-value">{step().label}</div>
      </div>

      <div class="media-editor__step-input-wrapper">
        <input
          type="range"
          min={0}
          max={props.steps.length - 1}
          step="1"
          value={stepIndex()}
          onInput={(e) => {
            const newValue = Math.round(clamp(e.currentTarget.valueAsNumber, 0, props.steps.length - 1)); // just in case
            props.onChange(props.steps[newValue].value);
          }}
        />
        <For each={props.steps}>
          {(_, index) => <>
            {index() && <div
              class="media-editor__step-input-separator"
              classList={{
                'media-editor__step-input-separator--active': isActive(index())
              }}
            />}
            <div
              class="media-editor__step-input-dot"
              classList={{
                'media-editor__step-input-dot--active': isActive(index()),
                'media-editor__step-input-dot--selected': isSelected(index())
              }}
            />
          </>}
        </For>
      </div>
    </div>
  );
}
