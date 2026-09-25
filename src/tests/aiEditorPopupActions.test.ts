import {createAiEditorPopupContextValue} from '@components/popups/aiEditorPopup/context';
import type {AiEditorPopupProps} from '@components/popups/aiEditorPopup/aiEditorPopup';
import deferredPromise from '@helpers/cancellablePromise';
import type {RichMessage, TextWithEntities} from '@layer';

const text: TextWithEntities.textWithEntities = {_: 'textWithEntities', text: 'Generated', entities: []};
const richMessage: RichMessage = {
  _: 'richMessage', pFlags: {}, photos: [], documents: [],
  blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Generated'}}]
};

for(const action of ['onApply', 'onApplyRichMessage', 'onSend', 'onSendRichMessage'] as const) {
  test.each(['success', 'refused', 'error', 'closed'] as const)(`${action} preserves the result until %s completion`, async(outcome) => {
    const pending = deferredPromise<boolean>();
    // The old callback discarded this promise; keep the rejection observable to this test.
    pending.catch(() => {});
    const callback = vi.fn(() => pending);
    const close = vi.fn();
    const error = vi.fn();
    let active = true;
    const context = createAiEditorPopupContextValue({
      peerId: 42 as PeerId,
      text,
      onApply: () => {},
      [action]: callback
    } as AiEditorPopupProps, close, {isActive: () => active, onError: error});
    const task = (context[action] as (value: unknown) => unknown)(action.endsWith('RichMessage') ? richMessage : text);
    expect(close).not.toHaveBeenCalled();
    expect(context.actionPending()).toBe(true);
    // Repeated activation while the first request is pending must not send twice.
    (context[action] as (value: unknown) => unknown)(text);
    expect(callback).toHaveBeenCalledTimes(1);
    if(outcome === 'closed') active = false;
    if(outcome === 'error') pending.reject(new Error('SEND_FAILED'));
    else pending.resolve(outcome !== 'refused');
    await task;
    expect(close).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0);
    expect(error).toHaveBeenCalledTimes(outcome === 'error' ? 1 : 0);
    expect(context.actionPending()).toBe(false);
  });
}

test('preserves synchronous void callback compatibility and reports a synchronous failure', async() => {
  const close = vi.fn();
  const onError = vi.fn();
  const onApply = vi.fn();
  const context = createAiEditorPopupContextValue({peerId: 42 as PeerId, text, onApply}, close, {
    isActive: () => true, onError
  });
  await context.onApply(text);
  expect(close).toHaveBeenCalledOnce();
  onApply.mockImplementationOnce(() => {throw new Error('APPLY_FAILED');});
  await context.onApply(text);
  expect(close).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledOnce();
});

test('does not start an action after its popup has closed', async() => {
  const onApply = vi.fn();
  const close = vi.fn();
  const context = createAiEditorPopupContextValue({peerId: 42 as PeerId, text, onApply}, close, {
    isActive: () => false, onError: vi.fn()
  });
  await context.onApply(text);
  expect(onApply).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
