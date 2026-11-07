// what a conformance case's message starts with, which these widgets have none of: not the client's whole message code
vi.mock('@lib/widgetSandbox/messageWidget', () => ({getWidgetData: () => ({chatData: null as string, publicData: null as string})}));

import {createRoot} from 'solid-js';
import {describe, expect, it} from 'vitest';
import {createMockWidget, setMockWidgetShared} from '@lib/widgetSandbox/mockBot';

// the widget sandbox's mock server: a widget_id's shared state is one, however many messages show the widget (the
// page's sandbox and one opened over it show the same fixtures), and publicData.ts polls through one of them
const HTML = '<p>shared</p>';

describe('the mock server\'s shared state of a widget', () => {
  setMockWidgetShared(true);

  it('is one for the widgets of a widget_id: a poll through any brings the bot\'s edit to all', () => createRoot(async(dispose) => {
    const below = createMockWidget('e2e/shared', HTML);
    const above = createMockWidget('e2e/shared', HTML);
    expect(above.publicData().widgetId).toBe(below.publicData().widgetId);

    above.editShared('v2');
    // only a poll brings it
    expect(above.data().publicData).toBe(null);
    // the poll goes through the first message of the widget_id, whichever widget asked the bot
    await below.publicData().managers.appWidgetsManager.pollWidgetPublicData(0, 0, []);
    expect(below.data().publicData).toBe('v2');
    expect(above.data().publicData).toBe('v2');
    dispose();
  }));

  it('is each message\'s own for a static widget (no widget_id): a vote in one is not counted in the other', () => createRoot(async(dispose) => {
    setMockWidgetShared(false);
    // bot-demos/02-poll's bot: a vote is counted in the public state
    const html = '<meta name="tw-bot" content="vote"><p>poll</p>';
    const below = createMockWidget('e2e/static-poll', html);
    const above = createMockWidget('e2e/static-poll', html);
    expect(above.publicData()).toBeUndefined();
    const votes = async(mock: typeof below) => {
      await mock.onRequest({data: 'vote:0'} as any);
      return JSON.parse(mock.data().publicData).v[0];
    };
    expect(await votes(below)).toBe(4);
    expect(await votes(above)).toBe(4);
    setMockWidgetShared(true);
    dispose();
  }));

  it('starts again from the bot\'s once no widget of it is left', () => createRoot(async(dispose) => {
    createRoot((disposeFirst) => {
      createMockWidget('e2e/again', HTML).editShared('v2');
      disposeFirst();
    });
    expect(createMockWidget('e2e/again', HTML).data().publicData).toBe(null);
    dispose();
  }));
});
