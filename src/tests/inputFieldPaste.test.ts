import '@/tests/mocks/chatInputEditorUi';
import '@helpers/peerIdPolyfill';
import InputField from '@components/inputField';

vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@lib/customEmoji/element', () => ({default: {create: vi.fn()}}));
vi.mock('@lib/customEmoji/renderer', () => ({CustomEmojiRendererElement: {create: vi.fn()}}));

/**
 * A contenteditable the composer's engine is not mounted on — a contact name, a
 * group name, a session label. Such a field sends a string, so the clipboard's
 * HTML has nowhere to land and only what the source calls plain text does.
 */
describe('paste into a field without the editor', () => {
  const mounted: InputField[] = [];
  let insertedHTML: string;

  const mountField = (options: ConstructorParameters<typeof InputField>[0] = {}) => {
    const inputField = new InputField(options);
    // jsdom does not reflect `contentEditable` into the attribute the delegated
    // listener matches on, which a browser does.
    inputField.input.setAttribute('contenteditable', 'true');
    document.body.append(inputField.container);
    mounted.push(inputField);
    return inputField;
  };

  const paste = (input: HTMLElement, data: Record<string, string>) => {
    const event = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {getData: (type: string) => data[type] ?? ''}
    });
    input.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    insertedHTML = undefined;
    document.execCommand = ((command: string, _ui: boolean, value: string) => {
      if(command === 'insertHTML') insertedHTML = value;
      return true;
    }) as typeof document.execCommand;
  });

  afterEach(() => {
    mounted.splice(0).forEach((inputField) => inputField.container.remove());
  });

  test('keeps the plain text and drops the formatting the clipboard offers', () => {
    const inputField = mountField({withLinebreaks: true});
    const event = paste(inputField.input, {
      'text/plain': 'bold and a link',
      'text/html': '<p><b>bold</b> and <a href="https://telegram.org/">a link</a></p>'
    });

    expect(event.defaultPrevented).toBe(true);
    expect(insertedHTML).toBe('bold and a link');
  });

  test('wraps the emoji the plain text itself carries', () => {
    const inputField = mountField({withLinebreaks: true});
    paste(inputField.input, {'text/plain': 'hi 🙂'});

    expect(insertedHTML).toContain('🙂');
    // Wrapped rather than left as the raw character, which is what the field
    // renders emoji with.
    expect(insertedHTML).toMatch(/class="emoji/);
  });

  test('puts a multi-line clipboard on the one line the field has', () => {
    const inputField = mountField();
    paste(inputField.input, {'text/plain': 'first\r\nsecond'});

    expect(insertedHTML).toBe('firstsecond');
  });

  test('keeps the lines when the field was built with them', () => {
    const inputField = mountField({withLinebreaks: true});
    paste(inputField.input, {'text/plain': 'first\nsecond'});

    expect(insertedHTML).toContain('first');
    expect(insertedHTML).toContain('second');
    expect(insertedHTML).not.toBe('firstsecond');
  });
});
