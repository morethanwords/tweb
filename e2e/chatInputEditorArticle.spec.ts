import {openEditor, settleNativeSelection} from './fixtures/chatInputEditorTest';
import {expect, test, type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import {
  CHAT_INPUT_EDITOR_ARTICLE_MARK_TYPES,
  CHAT_INPUT_EDITOR_ARTICLE_NODE_TYPES,
  chatInputEditorArticle
} from './fixtures/chatInputEditorArticle';
import type {
  ChatInputEditorBrowserHarness,
  TextblockDescriptor
} from './fixtures/chatInputEditor';

declare global {
  interface Window {
    chatInputEditorHarness: ChatInputEditorBrowserHarness,
    pullquoteWidthTestElement?: Element
  }
}

async function setDocument(page: Page, document = chatInputEditorArticle()) {
  expect(await page.evaluate((document) => (
    window.chatInputEditorHarness.setDocument(document)
  ), document)).toBe(true);
  await settleNativeSelection(page);
}

function collectTypes(document: JSONContent) {
  const marks = new Set<string>();
  const nodes = new Set<string>();
  const visit = (node: JSONContent) => {
    if(node.type) nodes.add(node.type);
    node.marks?.forEach((mark) => marks.add(mark.type));
    node.content?.forEach(visit);
  };
  visit(document);
  return {marks, nodes};
}

function visibleTextblocks(blocks: TextblockDescriptor[]) {
  return blocks
  .map((block, index) => ({...block, index}))
  .filter((block) => block.visible);
}

function blockLabel(block: TextblockDescriptor) {
  return `${block.path.join(' > ')} (${JSON.stringify(block.text)})`;
}

test.beforeEach(async({page}) => {
  await openEditor(page);
});

test('mounts the complete rich-text article with every editor node and mark', async({page}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await setDocument(page);

  const document = await page.evaluate(() => window.chatInputEditorHarness.document());
  const {marks, nodes} = collectTypes(document);
  CHAT_INPUT_EDITOR_ARTICLE_NODE_TYPES.forEach((type) => expect(nodes).toContain(type));
  CHAT_INPUT_EDITOR_ARTICLE_MARK_TYPES.forEach((type) => expect(marks).toContain(type));
  expect(pageErrors).toEqual([]);
});

test('shows MarkupTooltip only after a mouse selection is released', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{type: 'text', text: 'Select this text'}]
    }]
  });
  await page.evaluate(() => window.chatInputEditorHarness.enableMarkupTooltip());
  const points = await page.locator('[data-chat-input-paragraph]').first().evaluate((paragraph) => {
    const text = paragraph.firstChild!;
    const point = (offset: number) => {
      const range = document.createRange();
      range.setStart(text, offset);
      range.setEnd(text, offset);
      const rect = range.getBoundingClientRect();
      return {x: rect.left, y: rect.top + rect.height / 2};
    };
    return {end: point(6), start: point(0)};
  });

  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, {steps: 5});
  await settleNativeSelection(page);
  await expect(page.locator('.markup-tooltip.is-visible')).toHaveCount(0);

  await page.mouse.up();
  await expect(page.locator('.markup-tooltip')).toBeVisible();
});

test('resets MarkupTooltip horizontal scroll after its hide transition', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{type: 'text', text: 'Select this text'}]
    }]
  });
  await page.evaluate(() => {
    window.chatInputEditorHarness.enableMarkupTooltip();
    window.chatInputEditorHarness.setTextSelection(1, 7);
  });

  const tooltip = page.locator('.markup-tooltip');
  const scrollable = tooltip.locator('.scrollable-x');
  await expect(tooltip).toBeVisible();
  expect(await scrollable.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  })).toBeGreaterThan(0);

  await page.evaluate(() => window.chatInputEditorHarness.setCaret(1));
  await expect(tooltip).toHaveClass(/\bhide\b/);
  expect(await scrollable.evaluate((element) => element.scrollLeft)).toBe(0);

  await page.evaluate(() => window.chatInputEditorHarness.setTextSelection(1, 7));
  await expect(tooltip).toBeVisible();
  expect(await scrollable.evaluate((element) => element.scrollLeft)).toBe(0);
});

test('keeps the media menu inside a short viewport', async({page}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({height: 400, width: 600});
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{type: 'text', text: 'Before media'}]
    }]
  });
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.insertTestPhoto('/assets/img/camomile.jpg')
  ))).toBe(true);
  await settleNativeSelection(page);
  await page.locator('.chat-input-rich-media').evaluate((element) => {
    (element as HTMLElement).style.marginTop = '140px';
  });
  await page.evaluate(async() => {
    const modulePath = '/src/components/buttonMenuToggle.ts';
    const {default: ButtonMenuToggle} = await import(
      /* @vite-ignore */ modulePath
    );
    const original = document.querySelector<HTMLElement>(
      '.chat-input-rich-media-more'
    )!;
    const button = original.cloneNode(true) as HTMLElement;
    original.replaceWith(button);
    ButtonMenuToggle({
      buttons: Array.from({length: 6}, (_value, index) => ({
        onClick: () => {},
        regularText: `Media action ${index + 1}`
      })),
      container: button,
      direction: 'bottom-left',
      floatingDirection: 'bottom-end'
    });
  });

  const moreButton = page.locator('.chat-input-rich-media-more');
  await moreButton.click();
  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);
  await expect(moreButton).toHaveClass(/menu-open/);
  const menu = page.locator('.btn-menu.active');
  await expect(menu).toBeVisible();
  const bounds = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: innerHeight,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: innerWidth
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(8);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height - 8);
  expect(bounds.left).toBeGreaterThanOrEqual(8);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width - 8);
});

test('inserts a table after media when its empty caption has the caret', async({page}) => {
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.insertTestPhoto('/assets/img/camomile.jpg')
  ))).toBe(true);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInNode('richMedia', 0, 0)
  ))).toBe(true);

  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.insertStructuralBlock('table')
  ))).toBe(true);
  const state = await page.evaluate(() => ({
    document: window.chatInputEditorHarness.document(),
    selection: window.chatInputEditorHarness.selection()
  }));
  expect(state.document.content?.map(({type}) => type)).toEqual([
    'richMedia',
    'chatTableWrapper'
  ]);
  expect(state.document.content?.[0]).toMatchObject({
    attrs: {block: {photo_id: '1'}},
    type: 'richMedia'
  });
  expect(state.selection.path).toContain('table');
});

test('renders a real media spoiler without revealing it from the editor', async({page}) => {
  const previewUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 2;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#202020';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  });
  expect(await page.evaluate((previewUrl) => (
    window.chatInputEditorHarness.insertTestPhoto(previewUrl)
  ), previewUrl)).toBe(true);
  const initialState = await page.evaluate(() => new Promise<{
    animating: boolean,
    forwards: boolean,
    opacity: string,
    revealing: boolean
  } | null>((resolve) => {
    const item = document.querySelector<HTMLElement>('.chat-input-rich-media-item')!;
    const observer = new MutationObserver((records) => {
      for(const record of records) {
        for(const addedNode of record.addedNodes) {
          const spoiler = addedNode instanceof HTMLElement &&
            addedNode.matches('.media-spoiler-container') ?
            addedNode :
            addedNode instanceof HTMLElement ?
              addedNode.querySelector<HTMLElement>('.media-spoiler-container') :
              null;
          if(!spoiler) continue;
          observer.disconnect();
          resolve({
            animating: spoiler.classList.contains('animating'),
            forwards: spoiler.classList.contains('forwards'),
            opacity: getComputedStyle(spoiler).opacity,
            revealing: spoiler.classList.contains('is-revealing')
          });
          return;
        }
      }
    });
    observer.observe(item, {childList: true, subtree: true});
    const media = window.chatInputEditorHarness.document().content?.find((node) => (
      node.type === 'richMedia'
    ));
    const block = media?.attrs?.block;
    if(!block || block._ !== 'pageBlockPhoto') {
      observer.disconnect();
      resolve(null);
      return;
    }
    const updated = window.chatInputEditorHarness.setNodeAttributes('richMedia', 0, {
      block: {
        ...block,
        pFlags: {...block.pFlags, spoiler: true}
      }
    });
    if(!updated) {
      observer.disconnect();
      resolve(null);
    }
  }));
  expect(initialState).toEqual({
    animating: false,
    forwards: true,
    opacity: '0',
    revealing: true
  });

  await expect(page.locator('.chat-input-rich-media-item')).toHaveAttribute(
    'data-spoiler',
    ''
  );
  const spoiler = page.locator('.chat-input-rich-media-item .media-spoiler-container');
  await expect(spoiler).toBeVisible();
  await expect(spoiler).not.toHaveClass(/forwards/);
  await expect.poll(() => spoiler.evaluate((element) => getComputedStyle(element).opacity))
  .toBe('1');
  const dots = spoiler.locator('canvas.canvas-dots');
  await expect(dots).toHaveCount(1);
  expect(await dots.evaluate((canvas: HTMLCanvasElement) => (
    canvas.getBoundingClientRect().width
  ))).toBeGreaterThan(480);
  await expect(spoiler).not.toHaveAttribute('role', 'button');
  await expect(spoiler).not.toHaveAttribute('tabindex');
  await spoiler.click();
  await expect(spoiler).toHaveCount(1);
  await expect(page.locator('.chat-input-rich-media-item')).toHaveAttribute(
    'data-spoiler',
    ''
  );
  expect(await page.evaluate(() => {
    const media = window.chatInputEditorHarness.document().content?.find((node) => (
      node.type === 'richMedia'
    ));
    return media?.attrs?.block?.pFlags?.spoiler;
  })).toBe(true);
});

test('shows uploaded video duration in the editor', async({page}) => {
  expect(await page.evaluate(() => window.chatInputEditorHarness.insertTestVideo(
    'data:video/mp4;base64,',
    65
  ))).toBe(true);

  const duration = page.locator('.chat-input-rich-media-item .video-time');
  await expect(duration).toBeVisible();
  await expect(duration).toHaveText('1:05');
  expect(await duration.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      pointerEvents: style.pointerEvents,
      position: style.position,
      zIndex: style.zIndex
    };
  })).toEqual({
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: '3'
  });
});

test('uses clickable round dots and contained media in slideshows', async({page}) => {
  expect(await page.evaluate(() => window.chatInputEditorHarness.insertTestPhotos([
    '/assets/img/camomile.jpg',
    '/assets/img/camomile.jpg?slide=2',
    '/assets/img/camomile.jpg?slide=3'
  ], true))).toBe(true);

  const slideshow = page.locator('.chat-input-rich-media-slideshow');
  const dots = slideshow.locator('button[class*="Dot"]');
  const dotsContainer = slideshow.locator('[class*="Dots"]');
  await expect(dots).toHaveCount(3);
  await expect(dots.first()).toBeVisible();
  await expect(dots.first()).toHaveAttribute('aria-current', 'true');
  expect(await slideshow.evaluate((element) => element.getBoundingClientRect().height))
  .toBeLessThanOrEqual(360);
  const presentation = await slideshow.evaluate((element) => {
    const dotsContainer = element.querySelector<HTMLElement>('[class*="Dots"]')!;
    const dots = element.querySelectorAll<HTMLElement>('button[class*="Dot"]');
    const inactive = getComputedStyle(dots[1], '::after');
    const active = getComputedStyle(dots[0], '::after');
    return {
      activeOpacity: active.opacity,
      bottom: getComputedStyle(dotsContainer).bottom,
      dotHeight: inactive.height,
      dotOpacity: inactive.opacity,
      dotWidth: inactive.width,
      mediaFits: Array.from(element.querySelectorAll<HTMLElement>(
        '.media-container-aspecter > .media-photo'
      )).map((media) => getComputedStyle(media).objectFit),
      sideFills: Array.from(element.querySelectorAll<HTMLElement>(
        '.media-container-fitted > .chat-input-rich-media-side-fill'
      )).map((media) => {
        const style = getComputedStyle(media);
        return {filter: style.filter, objectFit: style.objectFit};
      })
    };
  });
  expect(presentation).toEqual({
    activeOpacity: '1',
    bottom: '12px',
    dotHeight: '6px',
    dotOpacity: '0.4',
    dotWidth: '6px',
    mediaFits: ['contain', 'contain', 'contain'],
    sideFills: [
      {filter: 'none', objectFit: 'cover'},
      {filter: 'none', objectFit: 'cover'},
      {filter: 'none', objectFit: 'cover'}
    ]
  });

  await slideshow.hover();
  await expect(dotsContainer).toHaveCSS('bottom', '28px');
  const mediaTooltip = page.locator('.chat-input-rich-media-tooltip');
  await expect(mediaTooltip).toHaveCSS('opacity', '1');
  const [dotsBox, tooltipBox] = await Promise.all([
    dotsContainer.boundingBox(),
    mediaTooltip.boundingBox()
  ]);
  expect(dotsBox!.y + dotsBox!.height).toBeLessThanOrEqual(tooltipBox!.y);

  await dots.nth(2).click();
  await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(slideshow.locator('[class*="Items"]')).toHaveCSS(
    'transform',
    /matrix\(1, 0, 0, 1, -\d+(?:\.\d+)?, 0\)/
  );
});

test('keeps complex collages within the shared media height', async({page}) => {
  expect(await page.evaluate(() => window.chatInputEditorHarness.insertTestPhotos([
    '/assets/img/camomile.jpg?collage=1',
    '/assets/img/camomile.jpg?collage=2',
    '/assets/img/camomile.jpg?collage=3',
    '/assets/img/camomile.jpg?collage=4',
    '/assets/img/camomile.jpg?collage=5'
  ]))).toBe(true);

  const collage = page.locator(
    '.chat-input-rich-media[data-rich-media-layout="collage"] .chat-input-rich-media-canvas'
  );
  await expect(collage).toBeVisible();
  expect(await collage.evaluate((element) => element.getBoundingClientRect().height))
  .toBeLessThanOrEqual(360);
});

test('keeps the natural tdesktop height for a two-item collage', async({page}) => {
  await page.setViewportSize({height: 800, width: 600});
  const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  expect(await page.evaluate((urls) => (
    window.chatInputEditorHarness.insertTestPhotos(urls)
  ), [`${pixel}#first`, `${pixel}#second`])).toBe(true);

  const collage = page.locator(
    '.chat-input-rich-media[data-rich-media-layout="collage"] .chat-input-rich-media-canvas'
  );
  await expect(collage).toBeVisible();
  expect(await collage.evaluate((element) => element.getBoundingClientRect().height))
  .toBeLessThan(360);
});

test('keeps a constrained searchable language menu below its trigger', async({page}) => {
  await page.setViewportSize({height: 400, width: 600});
  await page.evaluate(async() => {
    const trigger = document.createElement('button');
    trigger.id = 'e2e-code-language-trigger';
    Object.assign(trigger.style, {
      height: '20px',
      left: '100px',
      position: 'fixed',
      top: '180px',
      width: '100px'
    });
    document.body.append(trigger);
    await window.chatInputEditorHarness.openTestLanguageMenu(trigger);
  });

  const trigger = page.locator('#e2e-code-language-trigger');
  const menu = page.locator('.chat-input-code-language-menu.active');
  await expect(menu).toBeVisible();
  const before = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const scrollable = element.querySelector<HTMLElement>(
      '.btn-menu-search-scrollable'
    )!;
    const content = scrollable.querySelector<HTMLElement>('.scrollable')!;
    return {
      bottom: rect.bottom,
      height: rect.height,
      scrollable: content.scrollHeight > scrollable.clientHeight,
      top: rect.top
    };
  });
  const triggerRect = await trigger.evaluate((element) => (
    element.getBoundingClientRect().toJSON()
  ));
  expect(before.top).toBeGreaterThanOrEqual(triggerRect.bottom);
  expect(before.bottom).toBeLessThanOrEqual(400 - 16);
  expect(before.scrollable).toBe(true);

  await menu.locator('.btn-menu-item-input').fill('Language 19');
  await page.waitForFunction(() => (
    document.querySelectorAll(
      '.chat-input-code-language-menu .btn-menu-item:not(.btn-menu-search)'
    ).length === 1
  ));
  const after = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {height: rect.height, top: rect.top};
  });
  expect(after.top).toBeCloseTo(before.top, 1);
  expect(after.height).toBeLessThan(before.height);

  const [triggerBox, optionBox] = await Promise.all([
    trigger.boundingBox(),
    menu.locator('.btn-menu-item:not(.btn-menu-search)').boundingBox()
  ]);
  await page.mouse.move(
    triggerBox!.x + triggerBox!.width / 2,
    triggerBox!.y + triggerBox!.height / 2
  );
  await page.mouse.move(
    optionBox!.x + optionBox!.width / 2,
    optionBox!.y + optionBox!.height / 2,
    {steps: 5}
  );
  await expect(menu).toBeVisible();

  await menu.locator('.btn-menu-item-input').fill('missing-language');
  const noResults = menu.locator(
    '.btn-menu-item:not(.btn-menu-search)'
  );
  await expect(noResults).toHaveCount(1);
  await expect(noResults).toHaveText('No results');
  await expect(noResults).toHaveClass(/is-static/);
  await expect(menu.locator('.btn-menu-search-scrollable')).toHaveCSS('height', '42px');
  const noResultsBox = await noResults.boundingBox();
  await page.mouse.click(
    noResultsBox!.x + noResultsBox!.width / 2,
    noResultsBox!.y + noResultsBox!.height / 2
  );
  const search = menu.locator('.btn-menu-item-input');
  await expect(search).toBeFocused();
  await search.pressSequentially('x');
  await expect(search).toHaveValue('missing-languagex');
  await expect(menu).toBeVisible();
});

test('switches quotes between plain and rich representations without a stale author', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'blockquote',
      attrs: {collapsed: true},
      content: [{
        type: 'paragraph',
        content: [{type: 'text', text: 'Quote'}]
      }]
    }]
  });

  expect(await page.evaluate(() => window.chatInputEditorHarness.mode())).toBe('plain');
  await expect(page.locator('[data-blockquote-caption-content]')).toBeHidden();

  await page.evaluate(() => window.chatInputEditorHarness.setExpanded(true));
  expect(await page.evaluate(() => window.chatInputEditorHarness.mode())).toBe('rich');
  await expect(page.locator('[data-chat-input-blockquote-mode="rich"]')).toHaveCount(1);
  await expect(page.locator('[data-blockquote-caption-content]')).toBeVisible();
  // a quote of paragraphs stays collapsed in a rich message: layer 229's pageBlockBlockquote says so
  expect((await page.evaluate(() => window.chatInputEditorHarness.document()))
  .content?.[0].attrs).toMatchObject({collapsed: true, rich: true});

  await page.evaluate(() => window.chatInputEditorHarness.setExpanded(false));
  expect(await page.evaluate(() => window.chatInputEditorHarness.mode())).toBe('plain');
  await expect(page.locator('[data-blockquote-caption-content]')).toBeHidden();

  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'blockquote',
      attrs: {collapsed: false, rich: true},
      content: [{
        type: 'paragraph',
        content: [{type: 'text', text: 'Quote'}]
      }, {
        type: 'blockquoteCaption',
        content: [{type: 'text', text: 'Author'}]
      }]
    }]
  });
  expect(await page.evaluate(() => window.chatInputEditorHarness.mode())).toBe('rich');
  await expect(page.locator('[data-blockquote-caption-content]')).toHaveText('Author');
});

test('fits a multiline Pullquote around balanced lines through editing and resize', async({page}) => {
  await page.setViewportSize({width: 800, height: 600});
  await setDocument(page, {type: 'doc', content: [{type: 'pullquote', content: [{
    type: 'pullquoteText', content: [{type: 'text', text: 'A balanced pullquote should follow its lines of text instead of filling all the unused space in the editor. The caption stays underneath.'}]
  }]}]});
  const quote = page.locator('.chat-input-pullquote');
  const original = await page.evaluate(() => window.chatInputEditorHarness.document());
  const geometry = () => quote.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    let left = Infinity, right = -Infinity;
    for(const child of element.children) {
      const range = document.createRange();
      range.selectNodeContents(child);
      for(const rect of range.getClientRects()) {
        if(!rect.width) continue;
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
      }
    }
    return {
      width: box.width,
      textWidth: right - left,
      padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
      available: element.parentElement!.clientWidth,
      centerDelta: box.left + box.width / 2 - (element.parentElement!.getBoundingClientRect().left + element.parentElement!.clientWidth / 2)
    };
  });
  await expect.poll(async() => {
    const {width, textWidth, padding} = await geometry();
    return Math.abs(width - textWidth - padding);
  }).toBeLessThan(2);
  const first = await geometry();
  expect(first.width).toBeLessThan(first.available * .85);
  expect(Math.abs(first.centerDelta)).toBeLessThan(1);
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
  expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(false);
  await page.evaluate(() => window.pullquoteWidthTestElement = document.querySelector('.chat-input-pullquote')!);

  const surface = await page.evaluate(() => window.chatInputEditorHarness.textblocks().find((block) => block.type === 'pullquoteText')!);
  await page.evaluate(({from, to}) => window.chatInputEditorHarness.setTextSelection(from, to), surface);
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(surface.text);
  await page.keyboard.insertText('Short');
  await expect.poll(async() => (await geometry()).width).toBeLessThan(first.width);
  await expect(quote.locator('[data-pullquote-text]')).toHaveText('Short');
  expect(await page.evaluate(() => document.querySelector('.chat-input-pullquote') === window.pullquoteWidthTestElement)).toBe(true);
  await page.evaluate(() => window.chatInputEditorHarness.undo());
  await expect(quote.locator('[data-pullquote-text]')).toHaveText(surface.text);

  for(const width of [320, 1000]) {
    await page.setViewportSize({width, height: 600});
    await expect.poll(async() => {
      const {width, textWidth, padding, available} = await geometry();
      return width <= available + 1 && Math.abs(width - textWidth - padding) < 2;
    }).toBe(true);
    expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
    expect(await page.evaluate(() => document.querySelector('.chat-input-pullquote') === window.pullquoteWidthTestElement)).toBe(true);
  }
});

test('fills the active editor through the window test-data helper', async({page}) => {
  expect(await page.evaluate(() => window.fillChatInputEditorTestData?.())).toBe(true);

  const document = await page.evaluate(() => window.chatInputEditorHarness.document());
  const {marks, nodes} = collectTypes(document);
  CHAT_INPUT_EDITOR_ARTICLE_NODE_TYPES.forEach((type) => expect(nodes).toContain(type));
  CHAT_INPUT_EDITOR_ARTICLE_MARK_TYPES.forEach((type) => expect(marks).toContain(type));
  const image = page.locator(
    '.chat-input-rich-media .media-container-aspecter > .media-photo'
  );
  await expect(image).toHaveAttribute('src', /\/assets\/img\/camomile\.jpg$/);
  await expect(image).toBeVisible();
  const anchor = page.locator('[data-rich-anchor]');
  await expect(anchor).toHaveCount(1);
  await expect(anchor).toBeHidden();
  expect(await anchor.textContent()).toBe('');
  expect(await anchor.evaluate((element) => (
    element.getBoundingClientRect().height
  ))).toBe(0);
  const mapPreview = page.locator('.chat-input-rich-map-preview');
  await expect(mapPreview).toBeVisible();
  expect(await mapPreview.evaluate((element) => (
    element.getBoundingClientRect().height
  ))).toBeGreaterThan(0);

  const formula = page.locator('[data-inline-math]').first();
  await formula.click();
  const tooltip = page.locator('.chat-input-math-tooltip');
  await expect(tooltip).toBeVisible();
  const formulaInputSelection = await tooltip
  .locator('.chat-input-math-tooltip-input')
  .evaluate((element) => {
    const input = element as HTMLInputElement;
    return {end: input.selectionEnd, start: input.selectionStart};
  });
  expect(formulaInputSelection.end).toBe(formulaInputSelection.start);
  const [formulaBox, tooltipBox, tooltipPosition] = await Promise.all([
    formula.boundingBox(),
    tooltip.boundingBox(),
    tooltip.evaluate((element) => ({
      left: (element as HTMLElement).style.left,
      top: (element as HTMLElement).style.top,
      transform: (element as HTMLElement).style.transform
    }))
  ]);
  expect(tooltipPosition.left).not.toBe('');
  expect(tooltipPosition.top).not.toBe('');
  expect(tooltipPosition.transform).toBe('');
  expect(formulaBox).not.toBeNull();
  expect(tooltipBox).not.toBeNull();
  expect(tooltipBox!.x).toBeLessThan(formulaBox!.x + formulaBox!.width);
  expect(tooltipBox!.x + tooltipBox!.width).toBeGreaterThan(formulaBox!.x);
});

test('keeps an inserted map preview visible', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'richMap',
      attrs: {
        block: {
          _: 'inputPageBlockMap',
          caption: {
            _: 'pageCaption',
            credit: {_: 'textEmpty'},
            text: {_: 'textEmpty'}
          },
          geo: {
            _: 'inputGeoPoint',
            lat: 25.2048,
            long: 55.2708
          },
          h: 200,
          w: 400,
          zoom: 13
        },
        captionCredit: {_: 'textEmpty'}
      }
    }]
  });

  const preview = page.locator('.chat-input-rich-map-preview');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    mediaHeight: element.firstElementChild?.getBoundingClientRect().height,
    width: element.getBoundingClientRect().width
  }))).toEqual({height: 200, mediaHeight: 200, width: 800});
});

test('keeps the caret out of invisible rich anchors', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{type: 'text', text: 'Before'}]
    }, {
      type: 'richAnchor',
      attrs: {name: 'section'}
    }, {
      type: 'paragraph',
      content: [{type: 'text', text: 'After'}]
    }]
  });

  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setNodeSelection('richAnchor')
  ))).toBe(false);
  expect(await page.locator('[data-rich-anchor]').evaluate((element) => (
    getComputedStyle(element).pointerEvents
  ))).toBe('none');

  for(const [key, from, offset, expectedText, expectedOffset] of [
    ['ArrowRight', 0, 'end', 'After', 0],
    ['ArrowDown', 0, 'end', 'After', 0],
    ['ArrowLeft', 1, 0, 'Before', 6],
    ['ArrowUp', 1, 0, 'Before', 6]
  ] as const) {
    expect(await page.evaluate(({from, offset}) => (
      window.chatInputEditorHarness.setCaretInNode('paragraph', from, offset)
    ), {from, offset})).toBe(true);
    await page.keyboard.press(key);
    expect(await page.evaluate(() => window.chatInputEditorHarness.selection()))
    .toMatchObject({
      parentOffset: expectedOffset,
      text: expectedText,
      type: 'text'
    });
  }
});

test('selects syntax-highlighted code with a visible mouse selection', async({page}) => {
  const source = 'const answer = 42;';
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'codeBlock',
      attrs: {language: 'javascript'},
      content: [{type: 'text', text: source}]
    }]
  });

  const code = page.locator('.chat-input-code-block .code-code');
  const highlight = page.locator('.chat-input-code-highlight');
  const header = page.locator('.chat-input-code-block .code-header');
  await expect(header.locator('.inline-icon.inline-icon-right')).toHaveCount(1);
  const codeChrome = await header.evaluate((element) => {
    const copy = element.querySelector<HTMLElement>('.code-header-copy')!;
    const copyRect = copy.getBoundingClientRect();
    const probe = document.createElement('span');
    probe.style.color = 'var(--primary-color)';
    document.body.append(probe);
    const primaryColor = getComputedStyle(probe).color;
    probe.remove();
    const sharedWrapper = document.createElement('div');
    sharedWrapper.className = element.parentElement?.parentElement?.className || '';
    const sharedHeader = document.createElement('div');
    sharedHeader.className = 'code-header';
    sharedWrapper.append(sharedHeader);
    document.body.append(sharedWrapper);
    const sharedMarginOutsideChat = getComputedStyle(sharedHeader).marginTop;
    sharedWrapper.remove();
    return {
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(copy).color,
      fontSize: getComputedStyle(copy).fontSize,
      height: copyRect.height,
      marginTop: getComputedStyle(element).marginTop,
      primaryColor,
      reusedButton: copy.classList.contains('code-header-button') &&
        copy.classList.contains('hover-primary-effect'),
      sharedMarginOutsideChat,
      userSelect: getComputedStyle(element).userSelect ||
        getComputedStyle(element).getPropertyValue('-webkit-user-select'),
      width: copyRect.width
    };
  });
  expect(codeChrome.background).toBe('rgba(0, 0, 0, 0)');
  expect(codeChrome.color).toBe(codeChrome.primaryColor);
  expect(codeChrome.fontSize).toBe('16px');
  expect(codeChrome.height).toBeCloseTo(20, 1);
  expect(codeChrome.marginTop).toBe('1px');
  expect(codeChrome.reusedButton).toBe(true);
  expect(codeChrome.sharedMarginOutsideChat).toBe('1px');
  expect(codeChrome.userSelect).toBe('none');
  expect(codeChrome.width).toBeCloseTo(20, 1);
  const copyButton = header.locator('.code-header-copy');
  await copyButton.hover();
  const copyHover = await copyButton.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--light-primary-color)';
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      background: getComputedStyle(element).backgroundColor,
      expected,
      hovered: element.matches(':hover')
    };
  });
  expect(copyHover.hovered).toBe(true);
  expect(copyHover.background).toBe(copyHover.expected);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInTrailingPlaceholder()
  ))).toBe(true);
  const selectionBeforeLanguageMenu = await page.evaluate(() => (
    window.chatInputEditorHarness.selection()
  ));
  await header.locator('[data-code-language-picker]').click();
  await settleNativeSelection(page);
  expect(await page.evaluate(() => window.chatInputEditorHarness.selection()))
  .toEqual(selectionBeforeLanguageMenu);
  await expect(code).toHaveClass(/chat-input-code-editable-highlighted/);
  expect(await highlight.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.userSelect || style.getPropertyValue('-webkit-user-select');
  }))
  .toBe('none');
  const selectionBackground = await code.evaluate((element) => (
    getComputedStyle(element, '::selection').backgroundColor
  ));
  expect(selectionBackground).not.toBe('transparent');
  expect(selectionBackground).not.toBe('rgba(0, 0, 0, 0)');

  const points = await code.evaluate((element) => {
    const text = element.firstChild;
    if(!text || text.nodeType !== Node.TEXT_NODE) throw new Error('Code text node is missing');
    const point = (offset: number) => {
      const range = document.createRange();
      range.setStart(text, offset);
      range.collapse(true);
      const bounds = range.getBoundingClientRect();
      return {x: bounds.left, y: bounds.top + bounds.height / 2};
    };
    return {end: point(5), start: point(0)};
  });
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, {steps: 5});
  await page.mouse.up();
  await settleNativeSelection(page);

  expect((await page.evaluate(() => getSelection()?.toString() || '')).trim())
  .toBe('const');
  expect(await page.evaluate(() => window.chatInputEditorHarness.selection()))
  .toMatchObject({text: source, type: 'text'});
});

test('labels and serializes the detected Auto code language', async({page}) => {
  const source = 'const answer = 42;';
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'codeBlock',
      attrs: {language: ''},
      content: [{type: 'text', text: source}]
    }]
  });

  const codeBlock = page.locator('.chat-input-code-block');
  expect(await page.evaluate(async() => {
    await window.chatInputEditorHarness.resolveAutoCodeLanguages();
    const block = window.chatInputEditorHarness.richMessage().input.blocks[0];
    return block._ === 'pageBlockPreformatted' ? block.language : undefined;
  })).toBe('JavaScript');
  await expect(codeBlock.locator('.chat-input-code-language-label'))
  .toHaveText(/^JavaScript \(.*Auto\)$/);
  await expect(codeBlock.locator('.chat-input-code-highlight .prism-keyword')).toHaveText('const');
  expect(await page.evaluate(() => window.chatInputEditorHarness.document().content?.[0].attrs))
  .toMatchObject({
    detectedLanguage: 'JavaScript',
    detectedLanguageCode: source,
    language: ''
  });

  const languageLabel = codeBlock.locator('.chat-input-code-language-label');
  await languageLabel.evaluate((element) => {
    const target = element as HTMLElement & {
      observedLabels?: string[],
      observedLabelsObserver?: MutationObserver
    };
    target.observedLabels = [target.textContent || ''];
    target.observedLabelsObserver = new MutationObserver(() => {
      target.observedLabels!.push(target.textContent || '');
    });
    target.observedLabelsObserver.observe(target, {childList: true, subtree: true});
  });
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInNode('codeBlock', 0, 'end')
  ))).toBe(true);
  const suffix = ' const next = answer + 1;';
  await page.keyboard.type(suffix, {delay: 10});
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.document().content?.[0].attrs?.detectedLanguageCode
  ))).toBe(source);
  await expect.poll(() => page.evaluate(() => (
    window.chatInputEditorHarness.document().content?.[0].attrs?.detectedLanguageCode
  ))).toBe(source + suffix);
  const observedLabels = await languageLabel.evaluate((element) => {
    const target = element as HTMLElement & {
      observedLabels?: string[],
      observedLabelsObserver?: MutationObserver
    };
    target.observedLabelsObserver?.disconnect();
    return target.observedLabels || [];
  });
  expect(observedLabels.length).toBeGreaterThan(1);
  expect(observedLabels.every((label) => /^JavaScript \(.*Auto\)$/.test(label))).toBe(true);
});

test('keeps code-header controls out of an empty final code line', async({page}) => {
  const source = 'const answer = 42;\nconsole.log(answer);\n';
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'codeBlock',
      attrs: {language: 'javascript'},
      content: [{type: 'text', text: source}]
    }]
  });
  const code = page.locator('.chat-input-code-block code.code-code');
  const copy = page.locator('.chat-input-code-block .code-header-copy');
  await expect(copy).toHaveCount(1);
  expect(await copy.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(copy).toHaveAttribute('contenteditable', 'false');
  await expect(code.locator('.code-header-copy')).toHaveCount(0);
  expect(await code.textContent()).toBe(source);
  expect(await code.evaluate((element) => (
    Array.from(element.textContent || '').filter((character) => {
      const value = character.codePointAt(0)!;
      return value >= 0xE000 && value <= 0xF8FF;
    })
  ))).toEqual([]);
  await expect(code.locator('.ProseMirror-trailingBreak')).toHaveCount(1);

  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setCaretInNode('codeBlock', 0, 'end')
  ))).toBe(true);
  await page.keyboard.type('x');
  await settleNativeSelection(page);
  expect(await code.textContent()).toBe(`${source}x`);
});

test('imports spreadsheet TSV as a real table in the browser', async({page}) => {
  expect(await page.evaluate(() => {
    window.chatInputEditorHarness.setDocument({
      type: 'doc',
      content: [{type: 'paragraph'}]
    });
    const editor = document.querySelector('#editor');
    if(!editor) return false;
    const event = new Event('paste', {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => (
          type === 'text/plain' || type === 'Text' ? 'A\tB\nC\tD' : ''
        )
      }
    });
    editor.dispatchEvent(event);
    return true;
  })).toBe(true);
  await settleNativeSelection(page);

  const document = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(document.content?.[0]).toMatchObject({
    type: 'chatTableWrapper',
    content: [{type: 'chatTableTitle'}, {
      type: 'table',
      content: [{
        type: 'tableRow',
        content: [
          {type: 'tableCell', content: [{type: 'paragraph', content: [{text: 'A'}]}]},
          {type: 'tableCell', content: [{type: 'paragraph', content: [{text: 'B'}]}]}
        ]
      }, {
        type: 'tableRow',
        content: [
          {type: 'tableCell', content: [{type: 'paragraph', content: [{text: 'C'}]}]},
          {type: 'tableCell', content: [{type: 'paragraph', content: [{text: 'D'}]}]}
        ]
      }]
    }]
  });
});

for(const {type, start} of [{type: '1', start: 4414}, {type: 'I', start: 3888}, {type: 'A', start: 18279}]) {
  test(`keeps long ${type} list markers inside the editor and aligns item text`, async({page}) => {
    const item = (value: string, attrs?: Record<string, unknown>, nested = false): JSONContent => ({
      type: 'listItem', attrs, content: [
        {type: 'paragraph', content: [{type: 'text', text: value}]},
        ...(nested ? [{type: 'orderedList', attrs: {start: 4414, startExplicit: true}, content: [{
          type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text: 'Nested text'}]}]
        }]}] : [])
      ]
    });
    for(const width of [800, 320]) for(const direction of ['ltr', 'rtl'] as const) {
      await page.setViewportSize({width, height: 600});
      await page.evaluate(direction => window.chatInputEditorHarness.setDirection(direction), direction);
      await setDocument(page, {type: 'doc', content: [{type: 'orderedList', attrs: {type, start, startExplicit: true, reversed: true}, content: [
        item('First item'), item('Large override', {value: 999999999}), item('Following item'), item('Checked row', {checkbox: true, checked: true}), item('Nested parent', undefined, true)
      ]}]});
      const geometry = await page.locator('#editor').evaluate(editor => {
        const bounds = editor.getBoundingClientRect();
        const lists = [...editor.querySelectorAll<HTMLOListElement>('.chat-input-list-ordered')];
        return lists.map(list => {
          const rows = [...list.children] as HTMLElement[];
          return {
            reset: getComputedStyle(list).counterReset,
            rows: rows.map(row => {
              const rect = row.getBoundingClientRect();
              const marker = getComputedStyle(row, '::before');
              const content = row.querySelector<HTMLElement>('[data-chat-input-list-item-content]')!.getBoundingClientRect();
              const checkbox = row.dataset.checkbox === 'true';
              const markerWidth = checkbox ? row.querySelector('.chat-input-checklist-button')!.getBoundingClientRect().width : parseFloat(marker.width);
              return {left: rect.left - bounds.left, right: bounds.right - rect.right, markerWidth, marker: marker.content, checkbox, counterSet: getComputedStyle(row).counterSet, contentLeft: content.left, contentRight: content.right, width: rect.width};
            })
          };
        });
      });
      expect(geometry).toHaveLength(2);
      expect(geometry[0].reset).toContain(`iv-list-item ${start + 1}`);
      expect(geometry[0].rows[1].counterSet).toContain('iv-list-item 999999999');
      for(const list of geometry) for(const row of list.rows) {
        expect(row.left).toBeGreaterThanOrEqual(-1);
        expect(row.right).toBeGreaterThanOrEqual(-1);
        if(!row.checkbox) expect(row.marker).toContain('iv-list-item');
        expect(row.markerWidth).toBeGreaterThan(0);
        expect(row.markerWidth).toBeLessThan(row.width);
      }
      const aligned = geometry[0].rows.map(row => direction === 'ltr' ? row.contentLeft : row.contentRight);
      expect(Math.max(...aligned) - Math.min(...aligned)).toBeLessThan(1);
      expect(await page.locator('#editor').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toMatchObject({content: [{attrs: {start, reversed: true}}]});
    }
  });
}

test('updates the marker column after list numbering changes and Undo/Redo', async({page}) => {
  await setDocument(page, {type: 'doc', content: [{type: 'orderedList', attrs: {start: 4414, startExplicit: true}, content: ['A', 'B'].map(text => ({
    type: 'listItem', content: [{type: 'paragraph', content: [{type: 'text', text}]}]
  }))}]});
  const markerWidth = () => page.locator('.chat-input-list-ordered > li').first().evaluate(element => parseFloat(getComputedStyle(element, '::before').width));
  const wide = await markerWidth();
  await page.evaluate(() => window.chatInputEditorHarness.setCaretInNode('paragraph'));
  expect(await page.evaluate(() => window.chatInputEditorHarness.setNodeAttributes('orderedList', 0, {start: 1, startExplicit: true}))).toBe(true);
  await expect.poll(markerWidth).toBeLessThan(wide - 10);
  expect(await page.evaluate(() => window.chatInputEditorHarness.undo())).toBe(true);
  await expect.poll(markerWidth).toBeCloseTo(wide, 1);
  expect(await page.evaluate(() => window.chatInputEditorHarness.redo())).toBe(true);
  await expect.poll(markerWidth).toBeLessThan(wide - 10);
});

test('indents checklists one scaled rem less than regular lists', async({page}) => {
  const paragraph = (text: string): JSONContent => ({
    type: 'paragraph',
    content: [{type: 'text', text}]
  });
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'bulletList',
      content: [{
        type: 'listItem',
        content: [
          paragraph('Parent'),
          {
            type: 'bulletList',
            content: [{type: 'listItem', content: [paragraph('Nested bullet')]}]
          },
          {
            type: 'taskList',
            content: [{type: 'taskItem', attrs: {checked: false}, content: [paragraph('Nested task')]}]
          }
        ]
      }]
    }, {
      type: 'taskList',
      content: [{
        type: 'taskItem',
        attrs: {checked: false},
        content: [paragraph('Top-level task')]
      }]
    }, paragraph('Trailing')]
  });

  const paddings = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('[data-chat-input-editor="tiptap"]')!;
    const regularLists = editor.querySelectorAll<HTMLElement>('.chat-input-list-bullet');
    const checklists = editor.querySelectorAll<HTMLElement>('.chat-input-task-list');
    const nestedRegularList = editor.querySelector<HTMLElement>(
      '.chat-input-list-bullet .chat-input-list-bullet'
    )!;
    const nestedChecklist = editor.querySelector<HTMLElement>(
      '.chat-input-list-bullet .chat-input-task-list'
    )!;
    const editorStyle = getComputedStyle(editor);
    return {
      nestedChecklist: Number.parseFloat(getComputedStyle(nestedChecklist).paddingInlineStart),
      nestedRegular: Number.parseFloat(getComputedStyle(nestedRegularList).paddingInlineStart),
      topChecklist: Number.parseFloat(getComputedStyle(checklists[1]).paddingInlineStart),
      topRegular: Number.parseFloat(getComputedStyle(regularLists[0]).paddingInlineStart),
      scale: Number.parseFloat(editorStyle.getPropertyValue('--iv-scale')) || 1
    };
  });

  expect(paddings.topChecklist).toBeCloseTo(paddings.topRegular - 16 * paddings.scale, 4);
  expect(paddings.nestedChecklist).toBeCloseTo(paddings.nestedRegular - 16 * paddings.scale, 4);
});

test('round-trips the selected rich fragment used by AI compose', async({page}) => {
  await setDocument(page, {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        {type: 'text', text: 'Alpha '},
        {type: 'text', text: 'Beta', marks: [{type: 'bold'}]}
      ]
    }]
  });
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.setTextSelection(7, 11)
  ))).toBe(true);

  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.selectedRichMessage()?.output.blocks
  ))).toEqual([{
    _: 'pageBlockParagraph',
    text: {
      _: 'textBold',
      text: {_: 'textPlain', text: 'Beta'}
    }
  }]);

  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.replaceSelectionWithRichMessage({
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockParagraph',
        text: {
          _: 'textItalic',
          text: {_: 'textPlain', text: 'Gamma'}
        }
      }],
      photos: [],
      documents: []
    })
  ))).toBe(true);
  expect(await page.evaluate(() => (
    window.chatInputEditorHarness.document().content?.[0]
  ))).toEqual({
    type: 'paragraph',
    content: [
      {type: 'text', text: 'Alpha '},
      {type: 'text', text: 'Gamma', marks: [{type: 'italic'}]}
    ]
  });
});

test('never skips an adjacent visible text surface with cursor arrows', async({page}) => {
  test.setTimeout(60_000);
  await setDocument(page);
  const blocks = await page.evaluate(() => window.chatInputEditorHarness.textblocks());
  const visible = visibleTextblocks(blocks);
  expect(visible.length).toBeGreaterThan(20);

  for(let visibleIndex = 0; visibleIndex < visible.length; ++visibleIndex) {
    const block = visible[visibleIndex];
    const previous = visible[visibleIndex - 1];
    const next = visible[visibleIndex + 1];
    const inTable = block.path.includes('table');

    const checks: Array<{
      edge: 'end' | 'start',
      key: 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp',
      maximum: number,
      minimum: number
    }> = [
      {
        edge: 'start',
        key: 'ArrowLeft',
        minimum: previous?.from ?? block.from,
        maximum: block.to
      },
      {
        edge: 'end',
        key: 'ArrowRight',
        minimum: block.from,
        maximum: next?.to ?? block.to
      }
    ];
    if(!inTable) {
      checks.push({
        edge: 'start',
        key: 'ArrowUp',
        minimum: previous?.from ?? block.from,
        maximum: block.to
      }, {
        edge: 'end',
        key: 'ArrowDown',
        minimum: block.from,
        maximum: next?.to ?? block.to
      });
    }

    for(const check of checks) {
      await test.step(`${check.key} at ${check.edge} of ${blockLabel(block)}`, async() => {
        expect(await page.evaluate(({edge, index}) => (
          window.chatInputEditorHarness.setCaretInTextblock(index, edge)
        ), {edge: check.edge, index: block.index})).toBe(true);
        const before = await page.evaluate(() => window.chatInputEditorHarness.selection());
        await page.keyboard.press(check.key);
        await settleNativeSelection(page);
        const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
        expect(selection.from).toBeGreaterThanOrEqual(check.minimum);
        expect(selection.to).toBeLessThanOrEqual(check.maximum);
        const hasNeighbor = check.key === 'ArrowLeft' || check.key === 'ArrowUp' ?
          !!previous :
          !!next;
        if(hasNeighbor) {
          expect({from: selection.from, to: selection.to})
          .not.toEqual({from: before.from, to: before.to});
        }
      });
    }
  }
});

test('extends keyboard selection inside every non-empty text surface', async({page}) => {
  test.setTimeout(60_000);
  await setDocument(page);
  const blocks = visibleTextblocks(
    await page.evaluate(() => window.chatInputEditorHarness.textblocks())
  ).filter((block) => !!block.text);

  for(const block of blocks) {
    await test.step(`select forward in ${blockLabel(block)}`, async() => {
      expect(await page.evaluate((index) => (
        window.chatInputEditorHarness.setCaretInTextblock(index, 'start')
      ), block.index)).toBe(true);
      await settleNativeSelection(page);
      expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
      await page.keyboard.press('Shift+ArrowRight');
      await settleNativeSelection(page);
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(selection.to).toBeGreaterThan(selection.from);
      expect(selection.from).toBeGreaterThanOrEqual(block.from);
      expect(selection.to).toBeLessThanOrEqual(block.to);
    });

    await test.step(`select backward in ${blockLabel(block)}`, async() => {
      expect(await page.evaluate((index) => (
        window.chatInputEditorHarness.setCaretInTextblock(index, 'end')
      ), block.index)).toBe(true);
      await settleNativeSelection(page);
      expect(await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
      await page.keyboard.press('Shift+ArrowLeft');
      await settleNativeSelection(page);
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(selection.to).toBeGreaterThan(selection.from);
      expect(selection.from).toBeGreaterThanOrEqual(block.from);
      expect(selection.to).toBeLessThanOrEqual(block.to);
    });
  }
});

test('moves horizontally by one character inside every visible text node', async({page}) => {
  test.setTimeout(60_000);
  await setDocument(page);
  const ranges = (await page.evaluate(() => window.chatInputEditorHarness.textRanges()))
  .filter((range) => range.visible && range.to - range.from >= 3);
  expect(ranges.length).toBeGreaterThan(20);

  for(const range of ranges) {
    const label = `${range.path.join(' > ')} (${JSON.stringify(range.text)})`;
    await test.step(`ArrowLeft moves one character in ${label}`, async() => {
      expect(await page.evaluate((position) => (
        window.chatInputEditorHarness.setCaret(position)
      ), range.from + 2)).toBe(true);
      await settleNativeSelection(page);
      await page.keyboard.press('ArrowLeft');
      await settleNativeSelection(page);
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(selection.from).toBe(range.from + 1);
      expect(selection.to).toBe(range.from + 1);
    });

    await test.step(`ArrowRight moves one character in ${label}`, async() => {
      expect(await page.evaluate((position) => (
        window.chatInputEditorHarness.setCaret(position)
      ), range.from + 1)).toBe(true);
      await settleNativeSelection(page);
      await page.keyboard.press('ArrowRight');
      await settleNativeSelection(page);
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(selection.from).toBe(range.from + 2);
      expect(selection.to).toBe(range.from + 2);
    });
  }
});

test('moves vertically through the real table grid without skipping cells', async({page}) => {
  await setDocument(page);
  const blocks = await page.evaluate(() => window.chatInputEditorHarness.textblocks());
  const cases = [
    {edge: 'end', expected: 'Header A', key: 'ArrowDown', source: 'Table title'},
    {edge: 'end', expected: 'Cell A1', key: 'ArrowDown', source: 'Header A'},
    {edge: 'end', expected: 'Cell B1', key: 'ArrowDown', source: 'Header B'},
    {edge: 'start', expected: 'Header A', key: 'ArrowUp', source: 'Cell A1'},
    {edge: 'start', expected: 'Header B', key: 'ArrowUp', source: 'Cell B1'}
  ] as const;

  for(const cursorCase of cases) {
    const source = blocks.findIndex((block) => block.text === cursorCase.source);
    expect(source).toBeGreaterThanOrEqual(0);
    await test.step(`${cursorCase.source} ${cursorCase.key} → ${cursorCase.expected}`, async() => {
      expect(await page.evaluate(({edge, index}) => (
        window.chatInputEditorHarness.setCaretInTextblock(index, edge)
      ), {edge: cursorCase.edge, index: source})).toBe(true);
      await page.keyboard.press(cursorCase.key);
      await settleNativeSelection(page);
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(selection.text).toBe(cursorCase.expected);
    });
  }
});

test('crosses every inline atom with exactly one arrow press', async({page}) => {
  await setDocument(page);
  for(const type of ['inlineMath', 'inlineRichAnchor', 'customEmoji']) {
    const positions = await page.evaluate((type) => (
      window.chatInputEditorHarness.nodePositions(type)
    ), type);
    expect(positions).toHaveLength(1);
    const position = positions[0];

    await test.step(`ArrowLeft crosses ${type}`, async() => {
      expect(await page.evaluate((position) => (
        window.chatInputEditorHarness.setCaret(position + 1)
      ), position)).toBe(true);
      await page.keyboard.press('ArrowLeft');
      await settleNativeSelection(page);
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(selection.from).toBe(position);
    });

    await test.step(`ArrowRight crosses ${type}`, async() => {
      expect(await page.evaluate((position) => (
        window.chatInputEditorHarness.setCaret(position)
      ), position)).toBe(true);
      await page.keyboard.press('ArrowRight');
      await settleNativeSelection(page);
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(selection.from).toBe(position + 1);
    });
  }
});

test('Backspace deletes text inside every representative visible text surface', async({page}) => {
  test.setTimeout(60_000);
  await setDocument(page);
  const blocks = visibleTextblocks(
    await page.evaluate(() => window.chatInputEditorHarness.textblocks())
  ).filter((block) => !!block.text);
  const seen = new Set<string>();
  const representatives = blocks.filter((block) => {
    const key = block.path.join('>');
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for(const block of representatives) {
    await test.step(`Backspace in ${blockLabel(block)}`, async() => {
      await setDocument(page);
      const before = JSON.stringify(
        await page.evaluate(() => window.chatInputEditorHarness.document())
      );
      expect(await page.evaluate((index) => (
        window.chatInputEditorHarness.setCaretInTextblock(index, 'end')
      ), block.index)).toBe(true);
      await page.keyboard.press('Backspace');
      await settleNativeSelection(page);
      const after = JSON.stringify(
        await page.evaluate(() => window.chatInputEditorHarness.document())
      );
      const selection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(after).not.toBe(before);
      expect(selection.from).toBeLessThanOrEqual(selection.to);
      expect(selection.path.length).toBeGreaterThan(0);
    });
  }
});

test('Backspace does not dead-end at editable starts and Delete acts at mergeable roots', async({page}) => {
  test.setTimeout(120_000);
  await setDocument(page);
  const visible = visibleTextblocks(
    await page.evaluate(() => window.chatInputEditorHarness.textblocks())
  );

  for(let index = 1; index < visible.length; ++index) {
    const block = visible[index];
    if(block.path.includes('tableCell') || block.path.includes('tableHeader')) continue;
    await test.step(`Backspace at start of ${blockLabel(block)}`, async() => {
      await setDocument(page);
      expect(await page.evaluate((textblockIndex) => (
        window.chatInputEditorHarness.setCaretInTextblock(textblockIndex, 'start')
      ), block.index)).toBe(true);
      const beforeDocument = JSON.stringify(
        await page.evaluate(() => window.chatInputEditorHarness.document())
      );
      const beforeSelection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      await page.keyboard.press('Backspace');
      await settleNativeSelection(page);
      const afterDocument = JSON.stringify(
        await page.evaluate(() => window.chatInputEditorHarness.document())
      );
      const afterSelection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(
        afterDocument !== beforeDocument ||
        afterSelection.from !== beforeSelection.from ||
        afterSelection.to !== beforeSelection.to ||
        afterSelection.type !== beforeSelection.type
      ).toBe(true);
    });
  }

  for(let index = 0; index < visible.length - 1; ++index) {
    const block = visible[index];
    if(
      block.path.length !== 2 ||
      !['codeBlock', 'heading', 'paragraph'].includes(block.type) ||
      index === visible.length - 2 &&
      !visible[index + 1].text &&
      visible[index + 1].path.join('>') === 'doc>paragraph'
    ) continue;
    await test.step(`Delete at end of ${blockLabel(block)}`, async() => {
      await setDocument(page);
      expect(await page.evaluate((textblockIndex) => (
        window.chatInputEditorHarness.setCaretInTextblock(textblockIndex, 'end')
      ), block.index)).toBe(true);
      const beforeDocument = JSON.stringify(
        await page.evaluate(() => window.chatInputEditorHarness.document())
      );
      const beforeSelection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      await page.keyboard.press('Delete');
      await settleNativeSelection(page);
      const afterDocument = JSON.stringify(
        await page.evaluate(() => window.chatInputEditorHarness.document())
      );
      const afterSelection = await page.evaluate(() => window.chatInputEditorHarness.selection());
      expect(
        afterDocument !== beforeDocument ||
        afterSelection.from !== beforeSelection.from ||
        afterSelection.to !== beforeSelection.to ||
        afterSelection.type !== beforeSelection.type
      ).toBe(true);
    });
  }
});

test('keeps a short Pullquote with an author compact', async({page}) => {
  await setDocument(page, {type: 'doc', content: [{type: 'pullquote', content: [{type: 'pullquoteText', content: [{type: 'text', text: 'Pullquote'}]}, {type: 'pullquoteCaption', content: [{type: 'text', text: 'Pullquote author'}]}]}]});
  const quote = page.locator('.chat-input-pullquote');
  await expect(quote.locator('[data-pullquote-caption]')).toHaveText('Pullquote author');
  expect(await quote.evaluate(element => element.getBoundingClientRect().width / element.parentElement!.clientWidth)).toBeLessThan(.5);
});

for(const expanded of [false, true]) for(const trailingBreak of [false, true]) test(`quotes the middle line through MarkupTooltip with Undo/Redo (expanded=${expanded}, trailingBreak=${trailingBreak})`, async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await setDocument(page, {type: 'doc', content: [{type: 'paragraph', content: [
    {type: 'text', text: 'first'}, {type: 'hardBreak'}, {type: 'text', text: 'second'}, {type: 'hardBreak'}, {type: 'text', text: 'third'}
  ]}]});
  await page.evaluate(({expanded, trailingBreak}) => {
    window.chatInputEditorHarness.setExpanded(expanded);
    window.chatInputEditorHarness.enableMarkupTooltip();
    window.chatInputEditorHarness.setTextSelection(7, trailingBreak ? 14 : 13);
  }, {expanded, trailingBreak});
  const original = await page.evaluate(() => window.chatInputEditorHarness.document());
  await expect(page.locator('.markup-tooltip')).toBeVisible();
  await page.locator('.markup-tooltip').getByRole('button', {name: 'Quote', exact: true}).click();
  const quoted = await page.evaluate(() => window.chatInputEditorHarness.document());
  expect(quoted.content?.map(node => node.type)).toEqual(['paragraph', 'blockquote', 'paragraph']);
  expect(quoted.content?.[0].content).toEqual([{type: 'text', text: 'first'}]);
  expect(quoted.content?.[1].content?.[0].content).toEqual([{type: 'text', text: 'second'}]);
  expect(quoted.content?.[2].content).toEqual([{type: 'text', text: 'third'}]);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(quoted);
  expect(await page.evaluate(() => window.chatInputEditorHarness.selectedText())).toBe('second');
  await expect(page.locator('.markup-tooltip')).toBeVisible();
  await page.locator('.markup-tooltip').getByRole('button', {name: 'Quote', exact: true}).click();
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.map(node => node.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(quoted);
  expect(errors).toEqual([]);
});

for(const renderer of ['legacy', 'solid'] as const) test(`${renderer} renders a middle message blockquote without duplicate separator lines`, async({page}) => {
  const geometry = await page.evaluate(async(renderer) => {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.cssText = 'width: 320px; --line-height: 24px; --messages-text-size: 16px;';
    const message = document.createElement('div');
    message.className = 'message';
    bubble.append(message);
    document.body.append(bubble);
    const text = '123123\n123123\n123123';
    const entities = [
      {_: 'messageEntityLinebreak', offset: 6, length: 1},
      {_: 'messageEntityBlockquote', pFlags: {}, offset: 7, length: 6},
      {_: 'messageEntityLinebreak', offset: 13, length: 1}
    ];
    if(renderer === 'legacy') {
      const modulePath = '/src/lib/richTextProcessor/wrapRichText.ts';
      const {default: wrapRichText} = await import(/* @vite-ignore */ modulePath);
      message.append(wrapRichText(text, {entities}));
    } else {
      const modulePath = '/src/components/chat/bubbleParts/solidMessageText/index.tsx';
      const {createSolidMessageText} = await import(/* @vite-ignore */ modulePath);
      createSolidMessageText(message, {sourceRevision: 1, phase: 'final', source: {_: 'textWithEntities', text, entities}}, {inline: true});
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const nodes: Node[] = [];
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) if(walker.currentNode.textContent?.includes('123123')) nodes.push(walker.currentNode);
    const textRect = (node: Node) => {
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 6);
      return range.getBoundingClientRect();
    };
    const first = textRect(nodes[0]);
    const last = textRect(nodes[nodes.length - 1]);
    const quote = message.querySelector('blockquote')!.getBoundingClientRect();
    const style = getComputedStyle(message);
    return {before: quote.top - first.bottom, after: last.top - quote.bottom, lineHeight: parseFloat(style.lineHeight), whiteSpace: style.whiteSpace, text: message.innerText};
  }, renderer);
  expect(geometry.whiteSpace).toBe('pre-wrap');
  expect(geometry.before).toBeLessThan(geometry.lineHeight);
  expect(geometry.after).toBeLessThan(geometry.lineHeight);
  expect(geometry.text).toBe('123123\n123123\n123123');
});

for(const expanded of [false, true]) test(`Quote history survives changing composer expansion (initial=${expanded})`, async({page}) => {
  await setDocument(page, {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'First Second Third'}]}]});
  const original = await page.evaluate(() => window.chatInputEditorHarness.document());
  await page.evaluate(expanded => {
    window.chatInputEditorHarness.setExpanded(expanded);
    window.chatInputEditorHarness.enableMarkupTooltip();
    window.chatInputEditorHarness.setTextSelection(7, 13);
  }, expanded);
  await page.locator('.markup-tooltip').getByRole('button', {name: 'Quote', exact: true}).click();
  await page.evaluate(expanded => window.chatInputEditorHarness.setExpanded(!expanded), expanded);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => window.chatInputEditorHarness.document())).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await page.evaluate(() => window.chatInputEditorHarness.selectedText())).toBe('Second');
  const author = page.locator('[data-blockquote-caption-content]');
  if(expanded) await expect(author).toBeHidden();
  else await expect(author).toBeVisible();
  await page.evaluate(() => {
    window.chatInputEditorHarness.setExpanded(true);
    window.chatInputEditorHarness.setCaretInNode('blockquoteCaption');
    window.chatInputEditorHarness.setExpanded(false);
  });
  expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({text: 'Second', parentOffset: 6});
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({text: 'Third', parentOffset: 0});
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.chatInputEditorHarness.selection())).toMatchObject({text: 'Second', parentOffset: 6});
});

test('labels formatting controls and applies formatting through keyboard activation', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await setDocument(page, {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Text'}]}]});
  await page.evaluate(() => {
    window.chatInputEditorHarness.enableMarkupTooltip();
    window.chatInputEditorHarness.setTextSelection(1, 5);
  });
  const tooltip = page.locator('.markup-tooltip');
  await expect(tooltip).toBeVisible();
  const labels = await tooltip.locator('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
  expect(labels).toHaveLength(13);
  expect(labels.every(Boolean)).toBe(true);
  expect(new Set(labels).size).toBe(13);
  const bold = tooltip.getByRole('button', {name: 'KeyboardShortcuts.Action.Bold', exact: true});
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await bold.press('Enter');
  await settleNativeSelection(page);
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].content?.[0].marks).toEqual([{type: 'bold'}]);
  const quote = tooltip.getByRole('button', {name: 'Quote', exact: true});
  await quote.press('Space');
  await settleNativeSelection(page);
  await expect(quote).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.chatInputEditorHarness.document())).content?.[0].type).toBe('blockquote');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Text');
  expect(errors).toEqual([]);
});
