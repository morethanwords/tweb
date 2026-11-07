vi.mock('@lib/langPack', () => ({default: {format: (key: string) => key}}));

import makeMediaPreviewsAccessible from '@helpers/dom/mediaPreviewAccessibility';

describe('a bubble\'s media previews as buttons', () => {
  it('names a photo\'s attachment, not a widget\'s, whose controls are its own', () => {
    const bubble = document.createElement('div');
    const photo = document.createElement('div');
    photo.className = 'attachment';
    // * as the bubble makes a widget's attachment (bubbles.ts, messageMediaWidget)
    const widget = document.createElement('div');
    widget.className = 'attachment no-background';
    widget.setAttribute('role', 'none');
    const host = document.createElement('div');
    host.className = 'widget-shadow';
    host.attachShadow({mode: 'open'}).append(document.createElement('button'));
    widget.append(host);
    bubble.append(photo, widget);

    makeMediaPreviewsAccessible(bubble);

    expect(photo.getAttribute('role')).toBe('button');
    expect(photo.getAttribute('aria-label')).toBe('AccDescr.OpenMedia');
    expect(widget.getAttribute('role')).toBe('none');
    expect(widget.hasAttribute('aria-label')).toBe(false);
    expect(widget.hasAttribute('tabindex')).toBe(false);
  });
});
