import {afterEach, expect, it, vi} from 'vitest';

vi.mock('@lib/langPack', () => ({default: {format: (key: string) => key}}));
vi.mock('@components/ripple', () => ({default: vi.fn()}));

import AttachMenuButton from '@components/chat/attachMenuButton';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ensureButtonSemantics from '@helpers/dom/ensureButtonSemantics';

afterEach(() => document.body.replaceChildren());

it('cancels an upload from the keyboard without also opening the attachment menu', () => {
  const button = new AttachMenuButton();
  const cancel = vi.fn();
  const open = vi.fn();
  button.feedProps({isLoading: true, loadingProgress: .5, onCancel: cancel});
  ensureButtonSemantics(button);
  const detach = attachClickEvent(button, open);
  document.body.append(button);
  button.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
  expect(cancel).toHaveBeenCalledOnce();
  expect(open).not.toHaveBeenCalled();

  button.feedProps({isLoading: false});
  button.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
  expect(cancel).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
  detach();
});
