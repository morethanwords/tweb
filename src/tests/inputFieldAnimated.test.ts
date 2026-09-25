import InputFieldAnimated from '@components/inputFieldAnimated';
import {resizeObserverInstances, ResizeObserverMock} from './mocks/resizeObserver';

vi.mock('@components/inputField', () => ({
  default: class InputFieldMock {
    input = document.createElement('div');
    placeholder = document.createElement('span');

    constructor() {
      this.input.className = 'input-field-input';
      this.input.contentEditable = 'true';
      Object.defineProperty(this.input, 'isContentEditable', {value: true});
      this.placeholder.className = 'input-field-placeholder';
    }

    setValueSilently(value: string) {
      this.input.innerHTML = value;
    }

    syncFromInput() {
      this.input.dataset.syncedFromInput = '';
    }
  }
}));
vi.mock('@lib/richTextProcessor/wrapRichText', () => ({
  isCustomFillerNeededBySiblingNode: () => false
}));
vi.mock('@helpers/liteMode', () => ({
  default: {isAvailable: () => true}
}));

describe('InputFieldAnimated', () => {
  const mounted: InputFieldAnimated[] = [];

  afterEach(() => {
    mounted.forEach((inputField) => inputField.destroy());
    mounted.length = 0;
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  function mountInputField() {
    const inputField = new InputFieldAnimated();
    mounted.push(inputField);
    document.body.append(inputField.heightWrapper, inputField.placeholder);
    return inputField;
  }

  function getObserver(inputField: InputFieldAnimated) {
    return resizeObserverInstances.find((instance) => (
      instance.observe.mock.calls.some(([element]) => element === inputField.input)
    ));
  }

  function emitResize(inputField: InputFieldAnimated, blockSize: number) {
    const observer = getObserver(inputField);
    expect(observer).toBeInstanceOf(ResizeObserverMock);
    observer.callback([{
      target: inputField.input,
      borderBoxSize: [{blockSize, inlineSize: 200}]
    } as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver);
  }

  test('uses one real sizing wrapper without creating a fake editor', () => {
    const inputField = mountInputField();

    expect(inputField.heightWrapper.classList.contains('input-field-height-wrapper')).toBe(true);
    expect(Array.from(inputField.heightWrapper.children)).toEqual([inputField.input]);
    expect(inputField.placeholder.parentElement).toBe(document.body);
    expect('inputFake' in inputField).toBe(false);
    expect(document.querySelector('.input-field-input-fake')).toBeNull();
  });

  test('animates the wrapper from the real editor border box without fixing editor height', () => {
    const inputField = mountInputField();
    inputField.onChangeHeight = vi.fn();

    emitResize(inputField, 37);
    expect(inputField.heightWrapper.style.height).toBe('37px');
    expect(inputField.heightWrapper.style.transitionDuration).toBe('0ms');
    expect(inputField.input.style.height).toBe('');
    expect((inputField.input as any).oldHeight).toBe(37);
    expect((inputField.input as any).newHeight).toBe(37);

    emitResize(inputField, 85);
    expect(inputField.heightWrapper.style.height).toBe('85px');
    expect(parseFloat(inputField.heightWrapper.style.transitionDuration)).toBeGreaterThan(0);
    expect(inputField.input.style.height).toBe('');
    expect((inputField.input as any).oldHeight).toBe(37);
    expect((inputField.input as any).newHeight).toBe(85);
    expect(inputField.onChangeHeight).toHaveBeenNthCalledWith(1, 37);
    expect(inputField.onChangeHeight).toHaveBeenNthCalledWith(2, 85);

    emitResize(inputField, 85);
    expect(inputField.onChangeHeight).toHaveBeenCalledTimes(2);
  });

  test('clamps the observed height with the same max-height as the real editor', () => {
    const inputField = mountInputField();

    inputField.setMaxHeight(50);
    emitResize(inputField, 80);

    expect(inputField.input.style.maxHeight).toBe('50px');
    expect(inputField.heightWrapper.style.height).toBe('50px');
  });

  test('synchronizes base field state together with the measured height', () => {
    const inputField = mountInputField();
    vi.spyOn(inputField.input, 'offsetHeight', 'get').mockReturnValue(48);

    inputField.syncFromInput();

    expect(inputField.input.dataset.syncedFromInput).toBe('');
    expect(inputField.heightWrapper.style.height).toBe('48px');
  });

  test('ignores ResizeObserver while expanded and synchronously restores collapsed height', () => {
    const inputField = mountInputField();
    const readOffsetHeight = vi.spyOn(inputField.input, 'offsetHeight', 'get')
    .mockReturnValue(61);

    emitResize(inputField, 37);
    inputField.setHeightMeasurementEnabled(false);
    emitResize(inputField, 90);
    inputField.measureHeight();

    expect(inputField.heightWrapper.style.height).toBe('37px');
    expect(readOffsetHeight).not.toHaveBeenCalled();

    inputField.setHeightMeasurementEnabled(true);

    expect(readOffsetHeight).toHaveBeenCalledTimes(1);
    expect(inputField.heightWrapper.style.height).toBe('61px');
    expect(inputField.heightWrapper.style.transitionDuration).toBe('0ms');
  });

  test('updates only collapsible quotes and clears the state from code and pullquotes', () => {
    const inputField = mountInputField();
    const quote = document.createElement('div');
    quote.className = 'quote-like input-collapsible-quote';
    quote.style.lineHeight = '10px';
    quote.style.padding = '0';
    vi.spyOn(quote, 'scrollHeight', 'get').mockReturnValue(40);
    const code = document.createElement('pre');
    code.className = 'quote-like code can-send-collapsed';
    const pullquote = document.createElement('div');
    pullquote.className = 'quote-like chat-input-pullquote can-send-collapsed';
    inputField.input.append(quote, code, pullquote);

    inputField.input.dispatchEvent(new InputEvent('input'));

    expect(quote.classList.contains('can-send-collapsed')).toBe(true);
    expect(code.classList.contains('can-send-collapsed')).toBe(false);
    expect(pullquote.classList.contains('can-send-collapsed')).toBe(false);
  });

  test('disconnects the real editor observer on destroy', () => {
    const inputField = mountInputField();
    const observer = getObserver(inputField);

    inputField.destroy();

    expect(observer.unobserve).toHaveBeenCalledWith(inputField.input);
  });
});
