import InputField, {InputFieldOptions} from '@components/inputField';
import {observeResize} from '@components/resizeObserver';
import SetTransition from '@components/singleTransition';

const TRANSITION_DURATION_FACTOR = 50;

function getBorderBoxBlockSize(entry: ResizeObserverEntry) {
  const borderBoxSize = entry.borderBoxSize as
    ResizeObserverEntry['borderBoxSize'] | ResizeObserverSize;
  const size = Array.isArray(borderBoxSize) ? borderBoxSize[0] : borderBoxSize;
  return size?.blockSize || (entry.target as HTMLElement).offsetHeight;
}

export type InputFieldAnimatedOptions = InputFieldOptions;

export default class InputFieldAnimated extends InputField {
  public heightWrapper: HTMLDivElement;
  public onChangeHeight: (height: number) => void;

  private maxHeight: number | undefined;
  private measuredHeight: number | undefined;
  private heightMeasurementEnabled = true;
  private destroyed = false;
  private unobserveResize: () => void;

  constructor(options?: InputFieldAnimatedOptions) {
    super(options);

    this.input.classList.add('scrollable', 'scrollable-y', 'no-scrollbar');
    this.heightWrapper = this.input.ownerDocument.createElement('div');
    this.heightWrapper.className = 'input-field-height-wrapper';
    this.heightWrapper.append(this.input);

    this.input.addEventListener('input', this.onInput);
    this.unobserveResize = observeResize(this.input, this.onResize);
  }

  private onInput = () => {
    this.updateCollapsibleQuotes();
  };

  private onResize = (entry: ResizeObserverEntry) => {
    if(!this.heightMeasurementEnabled || this.destroyed) return;

    this.updateCollapsibleQuotes();
    this.applyHeight(getBorderBoxBlockSize(entry));
  };

  private updateCollapsibleQuotes() {
    Array.from(this.input.querySelectorAll('.quote-like')).forEach((element) => {
      if(!element.classList.contains('input-collapsible-quote')) {
        element.classList.remove('can-send-collapsed');
        return;
      }
      const scrollHeight = element.scrollHeight;
      const computedStyle = getComputedStyle(element);
      const lineHeight = parseFloat(computedStyle.lineHeight);
      const paddingTop = parseFloat(computedStyle.paddingTop);
      const paddingBottom = parseFloat(computedStyle.paddingBottom);
      const lines = (scrollHeight - paddingTop - paddingBottom) / lineHeight;
      element.classList.toggle('can-send-collapsed', lines > 3);
    });
  }

  private applyHeight(newHeight: number, setHeight = true, noAnimation?: boolean) {
    if(!newHeight || !this.input.isConnected) return;

    newHeight = Math.ceil(
      this.maxHeight === undefined ? newHeight : Math.min(newHeight, this.maxHeight)
    );
    const currentHeight = this.measuredHeight ?? newHeight;
    if(currentHeight === newHeight && this.heightWrapper.style.height) return;

    noAnimation ??= !this.input.isContentEditable || this.measuredHeight === undefined;
    const heightDifference = Math.abs(newHeight - currentHeight);
    const transitionDuration = noAnimation || heightDifference <= 1 ?
      0 :
      Math.round(TRANSITION_DURATION_FACTOR * Math.log(heightDifference));

    this.heightWrapper.style.transitionDuration = `${transitionDuration}ms`;

    if(setHeight) {
      this.onChangeHeight?.(newHeight);
      this.heightWrapper.style.height = `${newHeight}px`;
      (this.input as any).oldHeight = (this.input as any).newHeight ?? currentHeight;
      (this.input as any).newHeight = newHeight;
      this.measuredHeight = newHeight;
    }

    SetTransition({
      element: this.input,
      className: 'is-changing-height',
      forwards: true,
      duration: transitionDuration,
      onTransitionEnd: () => {
        this.input.classList.remove('is-changing-height');
        (this.input as any).oldHeight = (this.input as any).newHeight;
      }
    });
  }

  public setMaxHeight(value: number | undefined) {
    if(this.maxHeight === value) return;
    this.maxHeight = value;
    this.input.style.maxHeight = value !== undefined ? `${value}px` : '';
    if(this.heightMeasurementEnabled) this.measureHeight();
  }

  public measureHeight(setHeight = true, noAnimation?: boolean) {
    if(!this.heightMeasurementEnabled || this.destroyed || !this.input.isConnected) return;

    this.updateCollapsibleQuotes();
    this.applyHeight(this.input.offsetHeight, setHeight, noAnimation);
  }

  public syncFromInput() {
    super.syncFromInput();
    this.measureHeight();
  }

  public setHeightMeasurementEnabled(enabled: boolean) {
    if(this.heightMeasurementEnabled === enabled) return;
    this.heightMeasurementEnabled = enabled;
    if(enabled) this.measureHeight(true, true);
  }

  public setValueSilently(
    value: Parameters<InputField['setValueSilently']>[0],
    fromSet?: boolean
  ) {
    super.setValueSilently(value, fromSet);
    this.updateCollapsibleQuotes();
  }

  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    this.input.removeEventListener('input', this.onInput);
    this.unobserveResize();
  }
}
