import {makeMessagesManager, peerId} from '@/tests/helpers/messageSending';

// A text result of an inline bot picked to be scheduled, or sent without sound, is sent so: the request
// carries the date and the silence, as a media result's does.

describe('an inline bot\'s text result', () => {
  test('scheduled and silent, is sent scheduled and silent', async() => {
    const {manager, invokeApiAfter} = makeMessagesManager();
    const scheduleDate = 2e9;

    await manager.sendText({
      peerId,
      text: 'ok',
      viaBotId: 99 as BotId,
      queryId: '1',
      resultId: '2',
      scheduleDate,
      silent: true,
      forceOrdinary: true
    });

    expect(invokeApiAfter).toHaveBeenCalledOnce();
    const [method, params] = invokeApiAfter.mock.calls[0];
    expect(method).toBe('messages.sendInlineBotResult');
    expect(params).toMatchObject({query_id: '1', id: '2', schedule_date: scheduleDate, silent: true});
  });
});
