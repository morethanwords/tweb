import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import Section from '@components/section';

let dispose: () => void;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe('Section', () => {
  it('invokes its ref callback once', () => {
    const mount = document.createElement('div');
    const ref = vi.fn();
    document.body.append(mount);

    dispose = render(() => (
      <Section ref={ref}>
        Content
      </Section>
    ), mount);

    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][0]).toBe(mount.firstElementChild);
  });

  it('can render its caption above the section content', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Section
        caption={(<span data-testid="caption">Caption</span>) as HTMLElement}
        captionTop
      >
        <span data-testid="content">Content</span>
      </Section>
    ), mount);

    const caption = mount.querySelector('[data-testid="caption"]');
    const content = mount.querySelector('[data-testid="content"]');
    expect(caption.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();
  });

  it('can render only a caption without an empty content section', () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    dispose = render(() => (
      <Section caption="RemovedUsers" noContent />
    ), mount);

    const section = mount.firstElementChild;
    expect(section.childElementCount).toBe(1);
    expect(section.firstElementChild.classList.contains(
      'sidebar-left-section-caption'
    )).toBe(true);
  });
});
