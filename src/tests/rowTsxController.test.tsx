import {beforeEach, describe, expect, it, vi} from 'vitest';

const rippleCleanup = vi.hoisted(() => vi.fn());

vi.mock('@components/button', () => ({
  default: () => document.createElement('button')
}));

vi.mock('@components/checkboxField', () => ({
  default: class CheckboxField {
    public input = document.createElement('input');
    public label = document.createElement('label');
    public listenerSetter: undefined;

    constructor(options: {checked?: boolean, toggle?: boolean} = {}) {
      this.label.classList.add('checkbox-field');
      this.input.type = 'checkbox';
      this.input.checked = !!options.checked;
      this.label.append(this.input);
      if(options.toggle) {
        this.label.classList.add('checkbox-field-toggle');
        this.label.append(document.createElement('div'));
      }
    }

    public get checked() {
      return this.input.checked;
    }

    public set checked(value: boolean) {
      this.input.checked = value;
      this.input.dispatchEvent(new Event('change'));
    }

    public setValueSilently(value: boolean) {
      this.input.checked = value;
    }

    public toggleDisability(disabled: boolean) {
      this.label.classList.toggle('checkbox-disabled', disabled);
      this.input.disabled = disabled;
      return () => this.toggleDisability(!disabled);
    }
  }
}));

vi.mock('@components/icon', () => ({
  default: (_icon: string, ...classNames: string[]) => {
    const element = document.createElement('span');
    element.classList.add(...classNames);
    return element;
  },
  getIconContent: (icon: string) => icon
}));

vi.mock('@components/radioForm', () => ({
  default: vi.fn()
}));

vi.mock('@environment/touchSupport', () => ({default: true}));

vi.mock('@components/rippleElement', async() => {
  const {createRenderEffect, onCleanup} = await import('solid-js');
  const {insert} = await import('solid-js/web');
  return {
    default: (props: any) => {
      onCleanup(rippleCleanup);
      const element = document.createElement(props.component || 'div');
      createRenderEffect(() => {
        Object.entries(props.classList || {}).forEach(([className, enabled]) => {
          className.split(' ').forEach((name) => element.classList.toggle(name, !!enabled));
        });
        if(typeof(props.style) === 'object') {
          Object.assign(element.style, props.style);
        }
      });
      props.ref?.(element);
      if(props.onClick) element.addEventListener('click', props.onClick);
      insert(element, () => props.children);
      return element;
    }
  };
});

vi.mock('@helpers/dom/createContextMenu', () => ({
  default: () => ({open: () => {}})
}));

vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

import CheckboxField from '@components/checkboxField';
import CheckboxFields, {type CheckboxFieldsField} from '@components/checkboxFields';
import {attachRowController, type RowTsxController} from '@components/rowTsxController';
import ListenerSetter from '@helpers/listenerSetter';
import RowTsx from '@components/rowTsx';
import {createRoot, createSignal} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import {renderSearchWebPageRow} from '@components/searchWebPageRow';
import {renderChatlistTopNotification} from '@components/sidebarLeft/chatlistTopNotification';
import UsernameRow from '@components/usernameRow';

const mountController = (options: Parameters<typeof attachRowController>[1]) => {
  return attachRowController({}, options);
};

describe('rowTsxController', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    rippleCleanup.mockClear();
  });

  it('forwards direct RowTsx title and subtitle refs', () => {
    let title: HTMLDivElement;
    let titleRight: HTMLDivElement;
    let subtitle: HTMLDivElement;
    let subtitleRight: HTMLDivElement;
    const row = createRoot(() => (
      <RowTsx>
        <RowTsx.Title
          ref={title}
          titleRight="Right"
          titleRightRef={(element) => titleRight = element}
        >
          Title
        </RowTsx.Title>
        <RowTsx.Subtitle
          ref={subtitle}
          subtitleRight="Right"
          subtitleRightRef={(element) => subtitleRight = element}
        >
          Subtitle
        </RowTsx.Subtitle>
      </RowTsx>
    )) as HTMLElement;

    expect(title).toBe(row.querySelector('.row-title'));
    expect(titleRight).toBe(row.querySelector('.row-title-right'));
    expect(subtitle).toBe(row.querySelector('.row-subtitle'));
    expect(subtitleRight).toBe(row.querySelector('.row-subtitle-right'));
  });

  it('mounts RowTsx parts and keeps explicit imperative parts available', () => {
    const row = mountController({title: '<b>Title</b>', noRipple: true});

    expect(row.container.classList.contains('row')).toBe(true);
    expect(row.title.innerHTML).toBe('<b>Title</b>');
    expect(row.container.querySelector('.row-subtitle')).toBeNull();

    row.ensureSubtitle().append('Subtitle');
    expect(row.container.querySelector('.row-subtitle')?.textContent).toBe('Subtitle');

    const media = row.createMedia('small');
    expect(row.media).toBe(media);
    expect(media.classList.contains('row-media-small')).toBe(true);
    expect(media.parentElement).toBe(row.container);

    const replacementMedia = document.createElement('div');
    row.applyMediaElement(replacementMedia, 'big');
    expect(row.media).toBe(replacementMedia);
    expect(replacementMedia.classList.contains('row-media-big')).toBe(true);
    expect(replacementMedia.parentElement).toBe(row.container);
    expect(media.parentElement).toBeNull();
  });

  it('uses RowTsx field layout and honours the frozen click state', () => {
    const checkboxField = new CheckboxField({toggle: true});
    const row = mountController({
      checkboxField,
      noRipple: true,
      subtitle: 'Details',
      title: 'Toggle'
    });

    expect(checkboxField.label.classList.contains('row-checkbox-field-toggle')).toBe(true);
    expect(row.container.classList.contains('row-grid')).toBe(true);

    const onClick = vi.fn();
    const clickableRow = mountController({clickable: onClick, noRipple: true, title: 'Clickable'});
    clickableRow.container.click();
    clickableRow.freezed = true;
    clickableRow.container.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('runs cancellable locked field handlers on native click instead of touch mousedown', async() => {
    const checkboxField = new CheckboxField({round: true});
    const onClick = vi.fn((event: MouseEvent) => event.preventDefault());
    const row = mountController({
      checkboxField,
      clickable: onClick,
      noRipple: true,
      title: 'Locked option'
    });

    row.title.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));
    expect(onClick).not.toHaveBeenCalled();

    checkboxField.input.click();

    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick.mock.calls[0][0].type).toBe('click');
    expect(checkboxField.checked).toBe(false);

    await Promise.resolve();
    onClick.mockClear();
    row.title.click();

    expect(onClick).toHaveBeenCalledOnce();
    expect(checkboxField.checked).toBe(false);
  });

  it('exposes the title row synchronously for a toggle without a subtitle', () => {
    const checkboxField = new CheckboxField({toggle: true});
    const row = mountController({
      checkboxField,
      noRipple: true,
      title: 'Toggle'
    });

    expect(row.titleRow).not.toBeNull();
    expect(row.titleRight).toContain(checkboxField.label);
  });

  it('does not resolve the right-hand title as the main title', () => {
    const titleRight = document.createElement('span');
    const row = mountController({titleRight});

    expect(row.title).toBeNull();
    expect(row.titleRight).toContain(titleRight);
  });

  it('keeps stable part references when imperative code replaces their DOM nodes', () => {
    const row = mountController({title: 'Title', subtitle: 'Subtitle'});
    const originalSubtitle = row.subtitle;
    const replacementSubtitle = originalSubtitle.cloneNode(true) as HTMLElement;

    originalSubtitle.replaceWith(replacementSubtitle);

    expect(row.subtitle).toBe(originalSubtitle);
    expect(row.container.querySelector('.row-subtitle')).toBe(replacementSubtitle);
  });

  it('disposes the Solid root with its listener owner exactly once', () => {
    const listenerSetter = new ListenerSetter();
    const row = mountController({title: 'Disposable', listenerSetter});

    listenerSetter.removeAll();
    row.dispose();

    expect(rippleCleanup).toHaveBeenCalledTimes(1);
  });

  it('follows the middleware, not the listener owner, when both are given', () => {
    const listenerSetter = new ListenerSetter();
    const middleware = getMiddleware();
    mountController({title: 'Deferred', listenerSetter, middleware: middleware.get()});

    // an owner can stop listening long before it is done rendering (a popup drops its
    // listeners the moment it starts closing, 250ms before it leaves the DOM)
    listenerSetter.removeAll();
    expect(rippleCleanup).not.toHaveBeenCalled();

    middleware.destroy();
    expect(rippleCleanup).toHaveBeenCalledTimes(1);
  });

  it('renders a search web page result as a Solid link with external media', () => {
    const middleware = getMiddleware();
    const media = document.createElement('div');
    media.textContent = 'Preview';
    const row = renderSearchWebPageRow({
      title: 'Title',
      titleRight: '12:00',
      subtitle: 'Subtitle',
      media,
      link: {
        href: 'https://example.com/path',
        onClick: 'return false',
        targetBlank: true
      },
      middleware: middleware.get()
    }) as HTMLAnchorElement;

    expect(row).toBeInstanceOf(HTMLAnchorElement);
    expect(row.href).toBe('https://example.com/path');
    expect(row.getAttribute('onclick')).toBe('return false');
    expect(row.target).toBe('_blank');
    expect(row.rel).toBe('noopener noreferrer');
    expect(row.querySelector('.row-title')?.textContent).toBe('Title');
    expect(row.querySelector('.row-title-right')?.textContent).toBe('12:00');
    expect(row.querySelector('.row-subtitle')?.textContent).toBe('Subtitle');
    expect(media.classList.contains('row-media-big')).toBe(true);
    expect(media.parentElement).toBe(row);

    middleware.clean();
  });

  it('updates and disposes the shared-folder notification through Solid state', () => {
    const host = document.createElement('div');
    const onClick = vi.fn();
    const notification = renderChatlistTopNotification(host, {
      onClick,
      contextMenu: {buttons: []}
    });
    const row = host.firstElementChild as HTMLElement;

    notification.setTitle('Shared folder');
    notification.setSubtitle('Three new chats');

    expect(row.classList.contains('chatlist-top-notification')).toBe(true);
    expect(row.querySelector('.row-title')?.textContent).toBe('Shared folder');
    expect(row.querySelector('.row-subtitle')?.textContent).toBe('Three new chats');
    expect(row.querySelector('.row-icon')).not.toBeNull();

    row.click();
    expect(onClick).toHaveBeenCalledOnce();

    notification.setTitle(document.createTextNode('Updated folder'));
    expect(row.querySelector('.row-title')?.textContent).toBe('Updated folder');

    notification.dispose();
    notification.dispose();
    expect(rippleCleanup).toHaveBeenCalledOnce();
  });

  it('renders username state and sorting through direct RowTsx props', () => {
    let setActive: (active: boolean) => void;
    let dispose: VoidFunction;
    let sortableElement: HTMLElement;
    const onClick = vi.fn();
    const onSortPointerDown = vi.fn();
    const row = createRoot((disposeRoot) => {
      const [active, _setActive] = createSignal(false);
      setActive = _setActive;
      dispose = disposeRoot;
      return (
        <UsernameRow
          ref={(element) => sortableElement = element}
          active={active()}
          sortable
          sortingEnabled={active()}
          dragging
          sortHandlePointerDown={onSortPointerDown}
          style={{transform: 'translateY(12px)'}}
          title="@alice"
          subtitle="inactive"
          clickable={onClick}
        />
      );
    }) as HTMLElement;
    document.body.append(row);

    expect(row.querySelector('.row-title')?.textContent).toBe('@alice');
    expect(row.querySelector('.row-subtitle')?.textContent).toBe('inactive');
    expect(sortableElement).toBe(row);
    expect(row.classList.contains('row-sortable')).toBe(true);
    expect(row.classList.contains('cant-sort')).toBe(true);
    expect(row.classList.contains('is-dragging')).toBe(true);
    expect(row.style.transform).toBe('translateY(12px)');
    const sortHandle = row.querySelector('.row-sortable-handle');
    expect(sortHandle).not.toBeNull();

    sortHandle.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}));
    expect(onSortPointerDown).toHaveBeenCalledOnce();

    row.click();
    expect(onClick).toHaveBeenCalledOnce();

    (sortHandle as HTMLElement).click();
    expect(onClick).toHaveBeenCalledOnce();

    setActive(true);
    expect(row.classList.contains('active')).toBe(true);
    expect(row.classList.contains('cant-sort')).toBe(false);

    dispose();
  });

  it('keeps the paid invite-link username row layout', () => {
    const titleRight = document.createElement('span');
    titleRight.textContent = '100';
    let dispose: VoidFunction;
    const row = createRoot((disposeRoot) => {
      dispose = disposeRoot;
      return (
        <UsernameRow
          isLink
          icon="link_paid"
          color="green"
          title="Paid link"
          subtitle="Monthly"
          titleRight={titleRight}
        />
      );
    }) as HTMLElement;

    expect(row.classList.contains('is-link')).toBe(true);
    expect(row.classList.contains('is-paid')).toBe(true);
    expect(row.querySelector('.row-title')?.classList.contains('text-bold')).toBe(true);
    expect(row.querySelector('.row-title-right')).toContain(titleRight);
    expect((row.querySelector('.row-media') as HTMLElement).dataset.color).toBe('green');
    expect(row.querySelector('.tgico')?.textContent).toBe('link_paid');

    dispose();
  });

  it('keeps attached controller descriptors on the class prototype', () => {
    interface TestRow extends RowTsxController {}
    class TestRow {}

    const row = attachRowController(new TestRow(), {title: 'Attached'});

    expect(Object.prototype.hasOwnProperty.call(row, 'container')).toBe(false);
    expect(row.container.classList.contains('row')).toBe(true);
    row.dispose();
  });

  it('measures accordions after attachment when they are expanded', async() => {
    const nested: CheckboxFieldsField = {text: 'Nested' as any, checked: true};
    const parent: CheckboxFieldsField = {text: 'Parent' as any, nested: [nested]};
    const listenerSetter = new ListenerSetter();
    const fields = new CheckboxFields({fields: [parent, nested], listenerSetter});
    const {nodes} = fields.createField(parent);
    const accordion = nodes[1];
    expect(parent.row.container.querySelector('.row-title')?.textContent).toContain('Parent');
    expect(parent.row.container.querySelector('.checkbox-field-toggle')).not.toBeNull();
    Object.defineProperty(accordion, 'scrollHeight', {value: 144});
    document.body.append(...nodes);

    await Promise.resolve();
    expect(accordion.style.getPropertyValue('--max-height')).toBe('');

    parent.row.container.click();
    expect(accordion.style.getPropertyValue('--max-height')).toBe('144px');
    expect(accordion.classList.contains('is-expanded')).toBe(true);
    expect(parent.row.container.classList.contains('accordion-toggler-expanded')).toBe(true);

    const restoreDisability = parent.row.toggleDisability(true);
    expect(parent.row.container.classList.contains('is-disabled')).toBe(true);
    await Promise.resolve();
    expect(parent.row.container.getAttribute('aria-disabled')).toBe('true');
    restoreDisability();
    expect(parent.row.container.classList.contains('is-disabled')).toBe(false);
    expect(parent.row.container.hasAttribute('aria-disabled')).toBe(false);

    listenerSetter.removeAll();
  });

  it('keeps nested checkbox propagation and counter updates in the Solid row', () => {
    const first: CheckboxFieldsField = {text: 'First' as any, checked: true};
    const second: CheckboxFieldsField = {text: 'Second' as any, checked: false};
    const parent: CheckboxFieldsField = {text: 'Parent' as any, nested: [first, second]};
    const listenerSetter = new ListenerSetter();
    const onAnyChange = vi.fn();
    const fields = new CheckboxFields({
      fields: [parent, first, second],
      listenerSetter,
      onAnyChange
    });
    fields.createField(parent);

    expect(parent.nestedCounter.textContent).toBe('1/2');
    expect(parent.row.container.querySelector('.row-title-row')?.classList.contains('with-delimiter')).toBe(true);

    parent.checkboxField.label.lastElementChild.dispatchEvent(new MouseEvent('click', {bubbles: true}));

    expect(first.checkboxField.checked).toBe(true);
    expect(second.checkboxField.checked).toBe(true);
    expect(parent.checkboxField.checked).toBe(true);
    expect(parent.nestedCounter.textContent).toBe('2/2');
    expect(onAnyChange).toHaveBeenCalledTimes(2);

    listenerSetter.removeAll();
  });
});
