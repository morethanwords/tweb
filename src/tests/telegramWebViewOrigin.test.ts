import TelegramWebView from '@components/telegramWebView';

const MINI_APP_ORIGIN = 'https://miniapp.example';
const OTHER_ORIGIN = 'https://attacker.example';

function createWebView(origin?: string) {
  const webView = new TelegramWebView({origin});
  document.body.append(webView.iframe);
  webView.onMount();
  return webView;
}

// a frame that navigated away keeps the same WindowProxy, so `source` alone still resolves —
// only the origin tells the two documents apart
function postFromFrame(webView: TelegramWebView, origin: string) {
  window.dispatchEvent(new MessageEvent('message', {
    data: JSON.stringify({eventType: 'web_app_ready', eventData: ''}),
    origin,
    source: webView.iframe.contentWindow
  }));
}

describe('TelegramWebView origin binding', () => {
  let webViews: TelegramWebView[];

  beforeEach(() => {
    webViews = [];
  });

  afterEach(() => {
    webViews.forEach((webView) => {
      webView.destroy();
      webView.iframe.remove();
    });
  });

  function track(webView: TelegramWebView) {
    webViews.push(webView);
    return webView;
  }

  test('dispatches an event that came from the origin the frame was opened at', () => {
    const webView = track(createWebView(MINI_APP_ORIGIN));
    const onReady = vi.fn();
    webView.addEventListener('web_app_ready', onReady);

    postFromFrame(webView, MINI_APP_ORIGIN);

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('ignores an event from another origin in the same frame', () => {
    const webView = track(createWebView(MINI_APP_ORIGIN));
    const onReady = vi.fn();
    webView.addEventListener('web_app_ready', onReady);

    postFromFrame(webView, OTHER_ORIGIN);

    expect(onReady).not.toHaveBeenCalled();
  });

  test('follows the origin the frame is moved to by the server', () => {
    const webView = track(createWebView(MINI_APP_ORIGIN));
    const onReady = vi.fn();
    webView.addEventListener('web_app_ready', onReady);
    webView.setOrigin(OTHER_ORIGIN);

    postFromFrame(webView, MINI_APP_ORIGIN);
    expect(onReady).not.toHaveBeenCalled();

    postFromFrame(webView, OTHER_ORIGIN);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('keeps accepting any origin when the frame is not bound to one', () => {
    const webView = track(createWebView());
    const onReady = vi.fn();
    webView.addEventListener('web_app_ready', onReady);

    postFromFrame(webView, OTHER_ORIGIN);

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('addresses outgoing events to the bound origin', () => {
    const webView = track(createWebView(MINI_APP_ORIGIN));
    const postMessage = vi.spyOn(webView.iframe.contentWindow, 'postMessage');

    webView.dispatchWebViewEvent('popup_closed', {});

    expect(postMessage).toHaveBeenCalledWith(expect.any(String), MINI_APP_ORIGIN);
  });

  test('addresses outgoing events to any origin when the frame is not bound to one', () => {
    const webView = track(createWebView());
    const postMessage = vi.spyOn(webView.iframe.contentWindow, 'postMessage');

    webView.dispatchWebViewEvent('popup_closed', {});

    expect(postMessage).toHaveBeenCalledWith(expect.any(String), '*');
  });
});
