// The preview switcher. vite.preview.config.ts injects it into every preview's
// page, and it is the whole of the /_previews page. It names the tab after the
// task its checkout works on (`start-preview.sh --label`) and puts a badge in
// the corner that lists every running preview: the registry behind
// /_previews.json is shared by all checkouts, so any preview can reach the rest.
(() => {
  // The Document PiP window is an iframe of the app. The app's own browser
  // suites run against previews too, and they must see the client as it ships.
  if(window.top !== window || navigator.webdriver) return;

  const isIndexPage = location.pathname === '/_previews';

  // Another preview's address is this one's with the port swapped: localhost:9004,
  // or a proxy host that names the port (preview-9004.example.com). A host that
  // does not name it gets localhost.
  const urlOf = (port, current) => {
    const re = new RegExp(`(^|\\D)${current}(?=\\D|$)`);
    return re.test(location.host) ?
      `${location.protocol}//${location.host.replace(re, `$1${port}`)}/` :
      `http://localhost:${port}/`;
  };

  const nameOf = (preview) => preview.label || preview.checkout || preview.branch || `:${preview.port}`;

  const load = () => fetch('/_previews.json', {cache: 'no-store'}).then((response) => response.json());

  const el = (tag, className, text) => {
    const element = document.createElement(tag);
    if(className) element.className = className;
    if(text !== undefined) element.textContent = text;
    return element;
  };

  const renderList = (data) => {
    const list = el('ul', 'list');
    for(const preview of data.previews) {
      const isCurrent = preview.port === data.current;
      const item = list.appendChild(el('li'));
      const link = item.appendChild(el(isCurrent ? 'span' : 'a', 'item'));
      if(isCurrent) link.setAttribute('aria-current', 'page');
      else link.href = urlOf(preview.port, data.current);
      link.append(el('span', 'name', nameOf(preview)));
      const details = [preview.checkout || preview.branch, `:${preview.port}`];
      if(!preview.up) details.push('starting');
      link.append(el('span', 'details', details.filter(Boolean).join(' · ')));
    }
    if(!data.previews.length) list.append(el('li', 'empty', 'No previews running'));
    return list;
  };

  // The app's theme variables reach into the shadow root; the /_previews page
  // has none and follows the system theme.
  const STYLE = `
    :host {
      all: initial;
      font-family: inherit;
      color-scheme: light dark;
      --surface: var(--surface-color, Canvas);
      --text: var(--primary-text-color, CanvasText);
      --muted: var(--secondary-text-color, GrayText);
      --accent: var(--primary-color, #3390ec);
      font-size: 14px;
      line-height: 1.3;
    }
    .list { list-style: none; margin: 0; padding: 0; }
    .item {
      display: flex; flex-direction: column; gap: 2px;
      padding: 8px 12px; border-radius: 10px;
      color: var(--text); text-decoration: none;
    }
    a.item:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }
    .item[aria-current] { background: color-mix(in srgb, var(--accent) 14%, transparent); }
    .name { font-weight: 600; }
    .details, .empty { color: var(--muted); font-size: 12px; }
    .empty { padding: 8px 12px; }
    a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `;

  if(isIndexPage) {
    document.title = 'Previews';
    const root = document.body.attachShadow({mode: 'open'});
    root.innerHTML = `<style>${STYLE}
      :host { display: block; min-height: 100vh; background: var(--surface); color: var(--text); font-size: 16px; }
      main { max-width: 560px; margin: 0 auto; padding: 24px 12px; }
      h1 { font-size: 20px; margin: 0 12px 12px; }
      .details { font-size: 14px; }
    </style><main><h1>Previews</h1></main>`;
    load().then((data) => root.querySelector('main').append(renderList(data)));
    return;
  }

  const host = document.createElement('div');
  const root = host.attachShadow({mode: 'open'});
  // The badge hugs the bottom-left corner: on the desktop layout that is the
  // gutter under the columns, on a phone the corner below the composer's buttons.
  root.innerHTML = `<style>${STYLE}
    .badge, .panel {
      position: fixed; z-index: 2147483000;
      left: env(safe-area-inset-left, 0px); bottom: env(safe-area-inset-bottom, 0px);
    }
    .badge {
      max-width: 40vw; height: 16px; padding: 0 8px 0 6px; border: 0; border-radius: 0 8px 0 0;
      font-family: inherit; font-size: 11px; font-weight: 500; line-height: 16px;
      color: #fff; background: rgba(0, 0, 0, .6);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
    }
    .badge:hover, .badge:focus-visible, .badge[aria-expanded="true"] { background: rgba(0, 0, 0, .8); }
    .badge:focus-visible { outline-offset: -2px; }
    .panel {
      margin: 0 0 24px 8px; width: 280px; max-width: calc(100vw - 16px); max-height: calc(100vh - 40px);
      overflow: auto; box-sizing: border-box; padding: 6px;
      background: var(--surface); border-radius: 14px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, .25);
    }
    .panel[hidden] { display: none; }
    .footer { display: flex; justify-content: space-between; padding: 6px 12px 4px; font-size: 12px; }
    .footer a, .footer button { color: var(--accent); background: none; border: 0; padding: 0; font: inherit; cursor: pointer; text-decoration: none; }
  </style>
  <button class="badge" type="button" aria-expanded="false" aria-controls="panel"></button>
  <div class="panel" id="panel" role="region" aria-label="Previews" hidden>
    <div class="items"></div>
    <div class="footer"><a href="/_previews" target="_blank">All previews</a><button type="button" class="hide">Hide badge</button></div>
  </div>`;

  const badge = root.querySelector('.badge');
  const panel = root.querySelector('.panel');
  const items = root.querySelector('.items');

  const showList = (data) => items.replaceChildren(renderList(data));
  let loaded;
  const setOpen = (open) => {
    if(open === !panel.hidden) return;
    panel.hidden = !open;
    badge.setAttribute('aria-expanded', String(open));
    if(!open) return;
    // the list as the page got it, then as it is now
    if(loaded) showList(loaded);
    load().then(showList);
  };

  badge.addEventListener('click', () => setOpen(panel.hidden));
  root.querySelector('.hide').addEventListener('click', () => {
    // closed first: an open panel keeps taking Escape away from the app
    setOpen(false);
    host.remove();
  });
  // Keys pressed in the switcher are not the app's: it would take them as
  // typing into the composer.
  for(const type of ['keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  // Escape closes the open panel wherever the focus is (the app keeps pulling it
  // into the composer), and only the panel: this listener precedes the app's.
  window.addEventListener('keydown', (e) => {
    if(e.key !== 'Escape' || panel.hidden) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const focusInside = document.activeElement === host;
    setOpen(false);
    if(focusInside) badge.focus();
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if(!e.composedPath().includes(host)) setOpen(false);
  }, true);

  // Every title the app sets (unread counters, notification blinking) keeps the label.
  const keepTitle = (prefix) => {
    const apply = () => {
      if(!document.title.startsWith(prefix)) document.title = prefix + document.title;
    };
    apply();
    new MutationObserver(apply).observe(document.head, {subtree: true, childList: true, characterData: true});
  };

  load().then((data) => {
    loaded = data;
    const self = data.previews.find((preview) => preview.port === data.current);
    const name = self ? nameOf(self) : `:${data.current}`;
    badge.textContent = name;
    badge.setAttribute('aria-label', `Preview: ${name}. Show all previews`);
    keepTitle(`${name} · `);
    document.body.append(host);
  }, (e) => console.warn('[preview-switcher]', e));
})();
