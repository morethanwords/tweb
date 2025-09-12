import {Component, createMemo} from 'solid-js';

import {numberThousandSplitterForStars} from '../../../../../helpers/number/numberThousandSplitter';
import accumulate from '../../../../../helpers/array/accumulate';
import clamp from '../../../../../helpers/number/clamp';
import nMap from '../../../../../helpers/number/nMap';
import {i18n} from '../../../../../lib/langPack';

import styles from './starsRangeInput.module.scss';


const starsPerUnits: [units: number, stars: number][] = [
  [10, 1], // 1 star per unit until 10
  [10, 2], // 2 stars per unit until 30
  [14, 5], // 5 stars per unit until 100
  [10, 10], // 10 stars per unit until 200
  [12, 25], // 25 stars per unit until 500
  [10, 50], // 50 stars per unit until 1.000
  [15, 100], // 100 stars per unit until 2.500
  [20, 250], // 250 stars per unit until 7.500
  [5, 500] // 500 stars per unit until 10.000
]; // 106 total units, try to be something close to 100

const totalUnits = accumulate(starsPerUnits.map(v => v[0]), 0);
const totalStars = unitsToStars(totalUnits);

function unitsToStars(units: number) {
  let stars = 0;

  for(const [u, s] of starsPerUnits) {
    stars += Math.min(units, u) * s;
    units -= u;

    if(units <= 0) break;
  }

  return stars;
}

function starsToUnits(stars: number) {
  let units = 0;

  for(const [u, s] of starsPerUnits) {
    const v = Math.min(u, Math.floor(stars / s));

    stars -= v * s;
    units += v;
  }

  return units;
}

const StarRangeInput: Component<{
  value: number;
  onChange: (value: number) => void;
  startFromZero?: boolean;
}> = (props) => {
  const min = createMemo(() => props.startFromZero ? 0 : 1);

  const units = () => clamp(starsToUnits(props.value), min(), totalUnits);

  const normalizedValue = () => nMap(units(), min(), totalUnits, 0, 1);

  const onInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const clampedValue = clamp(e.currentTarget.valueAsNumber, min(), totalUnits)
    const newValue = Math.round(unitsToStars(clampedValue));

    props.onChange(newValue);
  }

  return (
    <div
      class={styles.Container}
      style={{
        '--normalized': normalizedValue(),
        '--w': normalizedValue() * 100 + '%'
      }}
    >
      <div class={styles.Row}>
        <div class={styles.Limit}>{min()}</div>
        <div class={styles.Value}>{i18n('Stars', [
          numberThousandSplitterForStars(parseInt(props.value.toFixed(0)))
        ])}</div>
        <div class={`${styles.Limit} ${styles.LimitLast}`}>{numberThousandSplitterForStars(totalStars)}</div>
      </div>
      <div class={styles.InputWrapper}>
        <input
          type="range"
          min={min()}
          max={totalUnits}
          step={1}
          value={units()}
          onInput={onInput}
        />
        <div class={styles.Background} />
        <div class={styles.Thumb} />
        <div class={styles.Progress} />
      </div>
    </div>
  );
}

export default StarRangeInput;


/*
// Snippet to adjust stars per unit

let a = [
  [10, 1],
  [10, 2],
  [14, 5],
  [10, 10],
  [12, 25],
  [10, 50],
  [15, 100],
  [20, 250],
  [5, 500]
]

let c = 0;
let tu = 0;
for (const [u, s] of a) {
  c += u * s;
  tu += u;
  console.log('tu, s, c', tu, s, c);
}
*/
