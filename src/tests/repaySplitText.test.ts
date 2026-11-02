import {makeMessagesManager, makeUpdates, peerId} from '@/tests/helpers/messageSending';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';

// A text too long for one message goes as several, each a request of its own. When a paid chat asks to pay
// again (its price changed), each request is sent again once: the first part alone, not the whole text,
// which would send and charge for the other parts twice.

describe('paying again for a text sent in parts', () => {
  test('sends each part again once', async() => {
    const {manager, invokeApiAfter} = makeMessagesManager();
    invokeApiAfter.mockRejectedValue({type: 'ALLOW_PAYMENT_REQUIRED_5'});
    vi.mocked(manager.beforeMessageSending).mockImplementation((message) => {
      message.send().catch(noop);
      return undefined;
    });
    vi.spyOn(manager, 'cancelPendingMessage').mockReturnValue(true);
    const tryRegisterRequest = vi.mocked((manager as any).repayRequestHandler.tryRegisterRequest);

    await manager.sendText({peerId, text: 'aaaabbbb', forceOrdinary: true}).catch(noop);
    await pause(0);
    const parts = invokeApiAfter.mock.calls.map(([, params]) => params.message);
    expect(parts).toHaveLength(2);

    invokeApiAfter.mockClear();
    invokeApiAfter.mockResolvedValue(makeUpdates());
    tryRegisterRequest.mock.calls.forEach(([{repayCallback}]: any) => repayCallback({}));
    await pause(0);

    expect(invokeApiAfter.mock.calls.map(([, params]) => params.message)).toEqual(parts);
  });

  test('a part that is a die alone stays text, sent and sent again', async() => {
    const {manager, invokeApiAfter} = makeMessagesManager();
    invokeApiAfter.mockRejectedValue({type: 'ALLOW_PAYMENT_REQUIRED_5'});
    vi.mocked(manager.beforeMessageSending).mockImplementation((message) => {
      message.send().catch(noop);
      return undefined;
    });
    vi.spyOn(manager, 'cancelPendingMessage').mockReturnValue(true);
    const sendOther = vi.spyOn(manager, 'sendOther').mockResolvedValue(undefined);
    const tryRegisterRequest = vi.mocked((manager as any).repayRequestHandler.tryRegisterRequest);

    // * the fixture's limit is 4 characters, and its dice are 🎲
    await manager.sendText({peerId, text: '🎲 aaaa🎲', forceOrdinary: true}).catch(noop);
    await pause(0);
    const parts = invokeApiAfter.mock.calls.map(([, params]) => params.message);
    expect(parts.length).toBeGreaterThan(1);
    expect(sendOther).not.toHaveBeenCalled();

    invokeApiAfter.mockClear();
    invokeApiAfter.mockResolvedValue(makeUpdates());
    tryRegisterRequest.mock.calls.forEach(([{repayCallback}]: any) => repayCallback({}));
    await pause(0);

    expect(sendOther).not.toHaveBeenCalled();
    expect(invokeApiAfter.mock.calls.map(([, params]) => params.message)).toEqual(parts);
  });

  test('a text sent again keeps its formatting where it was', async() => {
    const {manager, invokeApiAfter} = makeMessagesManager();
    invokeApiAfter.mockRejectedValue({type: 'ALLOW_PAYMENT_REQUIRED_5'});
    vi.mocked(manager.beforeMessageSending).mockImplementation((message) => {
      message.send().catch(noop);
      return undefined;
    });
    vi.spyOn(manager, 'cancelPendingMessage').mockReturnValue(true);
    const tryRegisterRequest = vi.mocked((manager as any).repayRequestHandler.tryRegisterRequest);

    // * the leading spaces are trimmed off as the text is sent, which moves the bold onto the text sent
    const entities = [{_: 'messageEntityBold', offset: 3, length: 1} as const];
    await manager.sendText({peerId, text: '  ab', entities, forceOrdinary: true}).catch(noop);
    await pause(0);

    // * what the send again is given, as it is given: the send itself works on it in its turn
    const again: any[] = [];
    vi.spyOn(manager, 'sendText').mockImplementation(async(options) => {
      again.push(structuredClone({text: options.text, entities: options.entities}));
    });
    tryRegisterRequest.mock.calls.forEach(([{repayCallback}]: any) => repayCallback({}));

    expect(again).toEqual([{text: '  ab', entities: [{_: 'messageEntityBold', offset: 3, length: 1}]}]);
  });
});
