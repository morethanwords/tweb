import {Accessor, createMemo, For, onCleanup, onMount} from 'solid-js';
import {ShareThemeBackdropOption} from '@layer';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import {rgbIntToHex} from '@helpers/color';
import I18n from '@lib/langPack';
import {DEFAULT_BACKDROP_NAME} from './colors';
import {getDefaultBackdrop} from './theme';
import styles from '@components/popups/myQrCode.module.scss';

/** The default circle, then the served colours in their order */
export function colorOptions(backdrops?: ShareThemeBackdropOption[]) {
  const list: Array<ShareThemeBackdropOption | undefined> = backdrops ? [...backdrops] : [];
  // a list that does not name the default has it first, as the built-in look
  if(!list.some((option) => option?.name === DEFAULT_BACKDROP_NAME)) list.unshift(undefined);
  return list;
}

/** A swatch shows the colours of its backdrop on a diagonal, as the Android client draws them */
const swatchBackground = (center: number, edge: number) => `linear-gradient(135deg, ${rgbIntToHex(center)}, ${rgbIntToHex(edge)})`;

/**
 * The colours: a grid of round swatches, three rows and a peek of the next, scrolling. A choice is a button that is
 * pressed (`aria-pressed`), which the shared picker grid walks with the arrow keys.
 */
export function ColorsPanel(props: {
  backdrops: Accessor<ShareThemeBackdropOption[] | undefined>,
  /** The id of the colour on show; `undefined` when it is a gift's */
  selectedId: Accessor<number | undefined>,
  onPick: (option: ShareThemeBackdropOption | undefined) => void
}) {
  let grid: HTMLDivElement;
  const options = createMemo(() => colorOptions(props.backdrops()));
  const isSelected = (option: ShareThemeBackdropOption | undefined) => {
    const id = props.selectedId();
    if(id === undefined) return false;
    return (option || getDefaultBackdrop(props.backdrops()) as ShareThemeBackdropOption).backdrop_id === id;
  };

  onMount(() => {
    const detach = attachPickerGrid(grid, '.' + styles.swatch);
    onCleanup(detach);
  });

  return (
    <div
      ref={grid}
      class={styles.swatches}
      role="group"
      aria-label={I18n.format('QRCode.Colors', true)}
      data-sheet-scroll
    >
      <For each={options()}>
        {(option) => {
          const backdrop = option || getDefaultBackdrop();
          return (
            <button
              type="button"
              class={styles.swatch}
              style={{'background-image': swatchBackground(backdrop.center_color, backdrop.edge_color)}}
              aria-label={option?.name || DEFAULT_BACKDROP_NAME}
              aria-pressed={isSelected(option)}
              onClick={() => props.onPick(option)}
            />
          );
        }}
      </For>
    </div>
  );
}
