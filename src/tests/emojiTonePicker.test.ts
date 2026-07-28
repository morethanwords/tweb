import contextMenuController from '@helpers/contextMenuController';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import {getEmojiSkinToneVariants} from '@helpers/emojiSkinTone';
import showEmojiTonePicker from '@components/emoticonsDropdown/emojiTonePicker';

vi.mock('@helpers/contextMenuController', () => ({
  default: {
    close: vi.fn()
  }
}));

describe('emoji tone picker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  test('renders with Solid, selects a tone and disposes its portal', () => {
    const target = document.createElement('button');
    document.body.append(target);
    const variants = getEmojiSkinToneVariants('👍').variants;
    const onSelect = vi.fn();
    const picker = showEmojiTonePicker({
      event: new MouseEvent('contextmenu'),
      variants,
      selectedTone: 3,
      renderEmoji: (emoji) => {
        const element = document.createElement('span');
        element.textContent = emoji;
        return element;
      },
      onSelect
    });

    picker.show(target);

    const container = document.querySelector('.emoji-tone-picker');
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.emoji-tone-picker-button'));
    expect(buttons).toHaveLength(6);
    expect(buttons[3].classList.contains('active')).toBe(true);
    expect(buttons[3].getAttribute('aria-pressed')).toBe('true');

    simulateClickEvent(buttons[4]);
    expect(onSelect).toHaveBeenCalledWith(4);
    expect(contextMenuController.close).toHaveBeenCalledOnce();

    picker.cleanup();
    vi.advanceTimersByTime(200);
    expect(document.querySelector('.emoji-tone-picker')).toBeNull();
  });
});
