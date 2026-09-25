import {useChatInputEditorHarness, TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {TextSelection} from '@tiptap/pm/state';
import {TOUCH_HOLD_DURATION} from '@helpers/dom/touchHold';

describe('Tiptap chat input editor: BlockDrag', () => {
  const {mountEditor, logicalTopLevelText} = useChatInputEditorHarness();

  test.each([
    {
      name: 'a range',
      sourceTexts: ['Keep', 'Second', 'Third'],
      selectionFrom: 1,
      selectionTo: 2,
      remainingTexts: ['Keep']
    },
    {
      name: 'a whole source list',
      sourceTexts: ['Second', 'Third'],
      selectionFrom: 0,
      selectionTo: 1,
      remainingTexts: []
    }
  ])('moves $name between compatible ordered lists', ({
    sourceTexts,
    selectionFrom,
    selectionTo,
    remainingTexts
  }) => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    const listAttrs = {start: 7, type: 'A', reversed: true};
    const listItem = (text: string, value: number) => ({
      type: 'listItem',
      attrs: {value},
      content: [{
        type: 'paragraph',
        content: [{type: 'text', text}]
      }]
    });
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: listAttrs,
          content: sourceTexts.map((text, index) => listItem(text, 9 + index))
        },
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'Between'}]
        },
        {
          type: 'orderedList',
          attrs: listAttrs,
          content: [
            listItem('Target first', 20),
            listItem('Target second', 21)
          ]
        }
      ]
    })).toBe(true);

    const sourceList = tiptap.state.doc.child(0);
    const targetListPosition = sourceList.nodeSize +
      tiptap.state.doc.child(1).nodeSize;
    const targetList = tiptap.state.doc.nodeAt(targetListPosition);
    const sourcePositions: number[] = [];
    const sourceElements: HTMLElement[] = [];
    let sourcePosition = 1;
    for(let index = 0; index < sourceList.childCount; ++index) {
      sourcePositions.push(sourcePosition);
      const element = tiptap.view.nodeDOM(sourcePosition) as HTMLElement;
      sourceElements.push(element);
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        bottom: (index + 1) * 40,
        height: 40,
        left: 0,
        right: 200,
        top: index * 40,
        width: 200,
        x: 0,
        y: index * 40,
        toJSON: () => ({})
      });
      sourcePosition += sourceList.child(index).nodeSize;
    }
    const targetElements: HTMLElement[] = [];
    let targetItemPosition = targetListPosition + 1;
    for(let index = 0; index < targetList.childCount; ++index) {
      const element = tiptap.view.nodeDOM(targetItemPosition) as HTMLElement;
      targetElements.push(element);
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        bottom: 200 + (index + 1) * 40,
        height: 40,
        left: 0,
        right: 200,
        top: 200 + index * 40,
        width: 200,
        x: 0,
        y: 200 + index * 40,
        toJSON: () => ({})
      });
      targetItemPosition += targetList.child(index).nodeSize;
    }
    const clickItem = (index: number, shiftKey = false) => {
      const event = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY: index * 40 + 20,
        shiftKey
      });
      Object.defineProperty(event, 'target', {value: sourceElements[index]});
      tiptap.view.someProp('handleClick', (handleClick) => (
        handleClick(tiptap.view, sourcePositions[index] + 1, event)
      ));
    };
    const pointerEvent = (
      type: string,
      pointerId: number,
      clientY: number
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: pointerId},
        pointerType: {value: 'mouse'}
      });
      return event;
    };
    const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint'
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((_clientX: number, clientY: number) => (
        clientY < 200 ?
          sourceElements[selectionFrom] :
          targetElements[targetElements.length - 1]
      ))
    });

    try {
      clickItem(selectionFrom);
      clickItem(selectionTo, true);
      const sourceElement = sourceElements[selectionFrom];
      sourceElement.dispatchEvent(pointerEvent(
        'pointerdown',
        51,
        selectionFrom * 40 + 20
      ));
      sourceElement.dispatchEvent(pointerEvent('pointermove', 51, 279));
      expect(input.querySelector('.chat-input-block-drop-indicator')).not.toBeNull();
      sourceElement.dispatchEvent(pointerEvent('pointerup', 51, 279));

      const lists: ProseMirrorNode[] = [];
      tiptap.state.doc.forEach((node) => {
        if(node.type.name === 'orderedList') lists.push(node);
      });
      expect(lists).toHaveLength(remainingTexts.length ? 2 : 1);
      if(remainingTexts.length) {
        expect([...Array(lists[0].childCount)].map((_, index) => (
          lists[0].child(index).textContent
        ))).toEqual(remainingTexts);
      }
      const movedTarget = lists[lists.length - 1];
      expect(movedTarget.attrs).toMatchObject(listAttrs);
      expect([...Array(movedTarget.childCount)].map((_, index) => (
        movedTarget.child(index).textContent
      ))).toEqual(['Target first', 'Target second', 'Second', 'Third']);
      expect([...Array(movedTarget.childCount)].map((_, index) => (
        movedTarget.child(index).attrs.value
      ))).toEqual([20, 21, 9 + selectionFrom, 9 + selectionTo]);
      expect([...input.querySelectorAll<HTMLElement>('.chat-input-block-selected')]
      .map((element) => element.textContent)).toEqual(['Second', 'Third']);

      expect(editor.undo()).toBe(true);
      expect(tiptap.state.doc.child(0).textContent).toBe(sourceTexts.join(''));
    } finally {
      if(elementFromPointDescriptor) {
        Object.defineProperty(
          document,
          'elementFromPoint',
          elementFromPointDescriptor
        );
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  test('splits an incompatible destination list around moved items', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    const listItem = (text: string, value: number) => ({
      type: 'listItem',
      attrs: {value},
      content: [{
        type: 'paragraph',
        content: [{type: 'text', text}]
      }]
    });
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: {start: 1, type: '1', reversed: false},
          content: [listItem('Move me', 4), listItem('Keep', 8)]
        },
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'Between'}]
        },
        {
          type: 'orderedList',
          attrs: {start: 5, type: 'A', reversed: false},
          content: [
            listItem('Target first', 10),
            listItem('Target second', 14)
          ]
        }
      ]
    })).toBe(true);

    const original = tiptap.state.doc.toJSON();
    const sourceList = tiptap.state.doc.child(0);
    const targetListPosition = sourceList.nodeSize +
      tiptap.state.doc.child(1).nodeSize;
    const sourceElement = tiptap.view.nodeDOM(1) as HTMLElement;
    const targetList = tiptap.state.doc.nodeAt(targetListPosition);
    const targetElements = [
      tiptap.view.nodeDOM(targetListPosition + 1) as HTMLElement,
      tiptap.view.nodeDOM(
        targetListPosition + 1 + targetList.child(0).nodeSize
      ) as HTMLElement
    ];
    vi.spyOn(sourceElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 40,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    targetElements.forEach((element, index) => {
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        bottom: 240 + index * 40,
        height: 40,
        left: 0,
        right: 200,
        top: 200 + index * 40,
        width: 200,
        x: 0,
        y: 200 + index * 40,
        toJSON: () => ({})
      });
    });

    const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint'
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((_clientX: number, clientY: number) => (
        clientY < 200 ? sourceElement : targetElements[1]
      ))
    });
    const pointerEvent = (type: string, clientY: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: 52},
        pointerType: {value: 'mouse'}
      });
      return event;
    };

    try {
      const click = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY: 20
      });
      Object.defineProperty(click, 'target', {value: sourceElement});
      tiptap.view.someProp('handleClick', (handleClick) => (
        handleClick(tiptap.view, 2, click)
      ));

      sourceElement.dispatchEvent(pointerEvent('pointerdown', 20));
      sourceElement.dispatchEvent(pointerEvent('pointermove', 240));
      expect(input.querySelector('.chat-input-block-drop-indicator')).not.toBeNull();
      sourceElement.dispatchEvent(pointerEvent('pointerup', 240));

      const lists: ProseMirrorNode[] = [];
      tiptap.state.doc.forEach((node) => {
        if(node.type.name === 'orderedList') lists.push(node);
      });
      expect(lists).toHaveLength(4);
      expect(lists.map((list) => list.textContent)).toEqual([
        'Keep',
        'Target first',
        'Move me',
        'Target second'
      ]);
      expect(lists.map((list) => ({
        reversed: list.attrs.reversed,
        start: list.attrs.start,
        startExplicit: list.attrs.startExplicit,
        type: list.attrs.type,
        value: list.child(0).attrs.value
      }))).toEqual([
        {reversed: false, start: 1, startExplicit: false, type: '1', value: 8},
        {reversed: false, start: 10, startExplicit: true, type: 'A', value: 10},
        {reversed: false, start: 1, startExplicit: false, type: '1', value: 4},
        {reversed: false, start: 14, startExplicit: true, type: 'A', value: 14}
      ]);
      expect(input.querySelector('.chat-input-block-selected')?.textContent)
      .toBe('Move me');
      expect(editor.undo()).toBe(true);
      expect(tiptap.state.doc.toJSON()).toEqual(original);
    } finally {
      if(elementFromPointDescriptor) {
        Object.defineProperty(
          document,
          'elementFromPoint',
          elementFromPointDescriptor
        );
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  test.each([
    {
      name: 'root',
      details: false,
      root: true,
      target: {
        type: 'paragraph',
        content: [{type: 'text', text: 'Target body'}]
      }
    },
    {
      name: 'quote',
      details: false,
      root: false,
      target: {
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{type: 'text', text: 'Target body'}]
        }]
      }
    },
    {
      name: 'details body',
      details: true,
      root: false,
      target: {
        type: 'details',
        attrs: {open: true},
        content: [
          {
            type: 'detailsSummary',
            content: [{type: 'text', text: 'Summary'}]
          },
          {
            type: 'detailsBody',
            content: [{
              type: 'paragraph',
              content: [{type: 'text', text: 'Target body'}]
            }]
          }
        ]
      }
    }
  ])('moves list items into a $name block gap as a source-style list', ({
    details,
    root,
    target
  }) => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    const listItem = (text: string, value: number) => ({
      type: 'listItem',
      attrs: {value},
      content: [{
        type: 'paragraph',
        content: [{type: 'text', text}]
      }]
    });
    const listAttrs = {start: 7, type: 'A', reversed: true};
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: listAttrs,
          content: [
            listItem('Move me', 9),
            listItem('Keep', 12)
          ]
        },
        target
      ]
    })).toBe(true);

    const original = tiptap.state.doc.toJSON();
    const sourceList = tiptap.state.doc.child(0);
    const targetPosition = sourceList.nodeSize;
    const targetNode = tiptap.state.doc.child(1);
    const targetParentPosition = root ?
      undefined :
      details ?
        targetPosition + 1 + targetNode.child(0).nodeSize :
        targetPosition;
    const targetChildPosition = targetParentPosition === undefined ?
      targetPosition :
      targetParentPosition + 1;
    const sourceElement = tiptap.view.nodeDOM(1) as HTMLElement;
    const targetElement = tiptap.view.nodeDOM(targetChildPosition) as HTMLElement;
    vi.spyOn(sourceElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 40,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    vi.spyOn(targetElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 240,
      height: 40,
      left: 0,
      right: 200,
      top: 200,
      width: 200,
      x: 0,
      y: 200,
      toJSON: () => ({})
    });

    const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint'
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((_clientX: number, clientY: number) => (
        clientY < 200 ? sourceElement : targetElement
      ))
    });
    const pointerEvent = (type: string, clientY: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: 53},
        pointerType: {value: 'mouse'}
      });
      return event;
    };

    try {
      const click = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY: 20
      });
      Object.defineProperty(click, 'target', {value: sourceElement});
      tiptap.view.someProp('handleClick', (handleClick) => (
        handleClick(tiptap.view, 2, click)
      ));

      sourceElement.dispatchEvent(pointerEvent('pointerdown', 20));
      sourceElement.dispatchEvent(pointerEvent('pointermove', 239));
      expect(input.querySelector('.chat-input-block-drop-indicator')).not.toBeNull();
      sourceElement.dispatchEvent(pointerEvent('pointerup', 239));

      const sourceAfter = tiptap.state.doc.child(0);
      expect(sourceAfter.textContent).toBe('Keep');
      const inserted = root ?
        tiptap.state.doc.child(2) :
        details ?
          tiptap.state.doc.child(1).child(1).child(1) :
          tiptap.state.doc.child(1).child(1);
      expect(inserted.type.name).toBe('orderedList');
      expect(inserted.attrs).toMatchObject({
        ...listAttrs,
        startExplicit: true
      });
      expect(inserted.child(0).attrs.value).toBe(9);
      expect(inserted.textContent).toBe('Move me');
      expect(input.querySelector('.chat-input-block-selected')?.textContent)
      .toBe('Move me');
      expect(editor.undo()).toBe(true);
      expect(tiptap.state.doc.toJSON()).toEqual(original);
    } finally {
      if(elementFromPointDescriptor) {
        Object.defineProperty(
          document,
          'elementFromPoint',
          elementFromPointDescriptor
        );
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  test.each([
    {
      name: 'quote',
      details: false,
      block: {
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{type: 'text', text: 'Container body'}]
        }]
      }
    },
    {
      name: 'details body',
      details: true,
      block: {
        type: 'details',
        attrs: {open: true},
        content: [
          {
            type: 'detailsSummary',
            content: [{type: 'text', text: 'Summary'}]
          },
          {
            type: 'detailsBody',
            content: [{
              type: 'paragraph',
              content: [{type: 'text', text: 'Container body'}]
            }]
          }
        ]
      }
    }
  ])('moves a root block range into a $name through pointer-capture hit testing', ({
    block,
    details
  }) => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'Move me'}]
        },
        block,
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'After'}]
        }
      ]
    })).toBe(true);

    const sourcePosition = 0;
    const source = tiptap.state.doc.child(0);
    const targetPosition = source.nodeSize;
    const target = tiptap.state.doc.child(1);
    const parentPosition = details ?
      targetPosition + 1 + target.child(0).nodeSize :
      targetPosition;
    const targetChildPosition = parentPosition + 1;
    const sourceElement = tiptap.view.nodeDOM(sourcePosition) as HTMLElement;
    const targetElement = tiptap.view.nodeDOM(targetChildPosition) as HTMLElement;
    vi.spyOn(sourceElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 40,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    vi.spyOn(targetElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 40,
      left: 0,
      right: 200,
      top: 60,
      width: 200,
      x: 0,
      y: 60,
      toJSON: () => ({})
    });

    const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint'
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((_clientX: number, clientY: number) => (
        clientY < 40 ? sourceElement : targetElement
      ))
    });
    const pointerEvent = (type: string, clientY: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: 31},
        pointerType: {value: 'mouse'}
      });
      return event;
    };

    try {
      editor.restoreSelection({from: 2, to: 2}, false);
      const click = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY: 20
      });
      Object.defineProperty(click, 'target', {value: sourceElement});
      tiptap.view.someProp('handleClick', (handleClick) => {
        handleClick(tiptap.view, 2, click);
        return true;
      });

      sourceElement.dispatchEvent(pointerEvent('pointerdown', 20));
      sourceElement.dispatchEvent(pointerEvent('pointermove', 90));
      expect(input.querySelector('.chat-input-block-drop-indicator')).not.toBeNull();
      sourceElement.dispatchEvent(pointerEvent('pointerup', 90));

      const movedContainer = tiptap.state.doc.child(0);
      const movedBody = details ? movedContainer.child(1) : movedContainer;
      expect([...Array(movedBody.childCount)]
      .map((_, index) => movedBody.child(index))
      .filter((node) => node.type.isInGroup('block'))
      .map((node) => node.textContent)).toEqual(['Container body', 'Move me']);
      expect(tiptap.state.selection.$from.parent.textContent).toBe('Move me');
      expect([...input.querySelectorAll<HTMLElement>('.chat-input-block-selected')]
      .map((element) => element.textContent)).toEqual(['Move me']);
      expect(editor.undo()).toBe(true);
      expect(tiptap.state.doc.child(0).textContent).toBe('Move me');
    } finally {
      if(elementFromPointDescriptor) {
        Object.defineProperty(
          document,
          'elementFromPoint',
          elementFromPointDescriptor
        );
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  test('rejects dropping a selected root container into its own descendant', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{type: 'text', text: 'Inside'}]
            },
            {
              type: 'paragraph',
              content: [{type: 'text', text: 'Nested'}]
            }
          ]
        },
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'After'}]
        }
      ]
    })).toBe(true);

    const original = tiptap.state.doc.toJSON();
    const quoteElement = tiptap.view.nodeDOM(0) as HTMLElement;
    const bodyElement = tiptap.view.nodeDOM(1) as HTMLElement;
    vi.spyOn(quoteElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 120,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    vi.spyOn(bodyElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 60,
      height: 40,
      left: 16,
      right: 184,
      top: 20,
      width: 168,
      x: 16,
      y: 20,
      toJSON: () => ({})
    });

    const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint'
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((_clientX: number, clientY: number) => (
        clientY < 10 ? quoteElement : bodyElement
      ))
    });
    const pointerEvent = (type: string, clientY: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: 32},
        pointerType: {value: 'mouse'}
      });
      return event;
    };

    try {
      const click = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY: 1
      });
      Object.defineProperty(click, 'target', {value: quoteElement});
      tiptap.view.someProp('handleClick', (handleClick) => {
        handleClick(tiptap.view, 1, click);
        return true;
      });

      quoteElement.dispatchEvent(pointerEvent('pointerdown', 1));
      quoteElement.dispatchEvent(pointerEvent('pointermove', 40));
      expect(input.querySelector('.chat-input-block-drop-indicator')).toBeNull();
      quoteElement.dispatchEvent(pointerEvent('pointerup', 40));
      expect(tiptap.state.doc.toJSON()).toEqual(original);
    } finally {
      if(elementFromPointDescriptor) {
        Object.defineProperty(
          document,
          'elementFromPoint',
          elementFromPointDescriptor
        );
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  test('rejects a schema-invalid first list-item block and accepts it after the paragraph', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: {level: 2},
          content: [{type: 'text', text: 'Move me'}]
        },
        {
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: [{type: 'text', text: 'First paragraph'}]
            }]
          }]
        },
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'After'}]
        }
      ]
    })).toBe(true);

    const source = tiptap.state.doc.child(0);
    const listPosition = source.nodeSize;
    const itemPosition = listPosition + 1;
    const paragraphPosition = itemPosition + 1;
    const sourceElement = tiptap.view.nodeDOM(0) as HTMLElement;
    const paragraphElement = tiptap.view.nodeDOM(paragraphPosition) as HTMLElement;
    vi.spyOn(sourceElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 40,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    vi.spyOn(paragraphElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 40,
      left: 16,
      right: 200,
      top: 60,
      width: 184,
      x: 16,
      y: 60,
      toJSON: () => ({})
    });

    const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint'
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((_clientX: number, clientY: number) => (
        clientY < 40 ? sourceElement : paragraphElement
      ))
    });
    const pointerEvent = (
      type: string,
      pointerId: number,
      clientY: number
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: pointerId},
        pointerType: {value: 'mouse'}
      });
      return event;
    };

    try {
      const click = new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 1,
        clientY: 20
      });
      Object.defineProperty(click, 'target', {value: sourceElement});
      tiptap.view.someProp('handleClick', (handleClick) => {
        handleClick(tiptap.view, 1, click);
        return true;
      });

      sourceElement.dispatchEvent(pointerEvent('pointerdown', 41, 20));
      sourceElement.dispatchEvent(pointerEvent('pointermove', 41, 61));
      expect(input.querySelector('.chat-input-block-drop-indicator')).toBeNull();
      sourceElement.dispatchEvent(pointerEvent('pointerup', 41, 61));
      expect(tiptap.state.doc.child(0).type.name).toBe('heading');

      sourceElement.dispatchEvent(pointerEvent('pointerdown', 42, 20));
      sourceElement.dispatchEvent(pointerEvent('pointermove', 42, 99));
      expect(input.querySelector('.chat-input-block-drop-indicator')).not.toBeNull();
      sourceElement.dispatchEvent(pointerEvent('pointerup', 42, 99));

      const listItem = tiptap.state.doc.child(0).child(0);
      expect([...Array(listItem.childCount)].map((_, index) => (
        listItem.child(index).type.name
      ))).toEqual(['paragraph', 'heading']);
      expect([...Array(listItem.childCount)].map((_, index) => (
        listItem.child(index).textContent
      ))).toEqual(['First paragraph', 'Move me']);
      expect(listItem.type.validContent(listItem.content)).toBe(true);
    } finally {
      if(elementFromPointDescriptor) {
        Object.defineProperty(
          document,
          'elementFromPoint',
          elementFromPointDescriptor
        );
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  test('starts a frame drag on the first mouse move and on a touch hold', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    editor.setTextWithEntities('First\nSecond\nThird');

    const blocks: HTMLElement[] = [];
    let position = 0;
    for(let index = 0; index < tiptap.state.doc.childCount - 1; ++index) {
      const block = tiptap.view.nodeDOM(position) as HTMLElement;
      blocks.push(block);
      vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
        bottom: (index + 1) * 40,
        height: 40,
        left: 0,
        right: 200,
        top: index * 40,
        width: 200,
        x: 0,
        y: index * 40,
        toJSON: () => ({})
      });
      position += tiptap.state.doc.child(index).nodeSize;
    }

    const pointerEvent = (
      type: string,
      pointerId: number,
      clientX: number,
      clientY: number,
      pointerType = 'mouse'
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: pointerId},
        pointerType: {value: pointerType}
      });
      return event;
    };
    const dragging = () => input.classList.contains('chat-input-block-dragging');

    // Select the block so the frame can grab it.
    blocks[1].dispatchEvent(pointerEvent('pointerdown', 1, 100, 60));

    // A distance threshold here is felt as the drag standing still and then
    // catching up, so one pixel has to be enough — as it is for `Sortable`.
    blocks[1].dispatchEvent(pointerEvent('pointerdown', 2, 1, 60));
    expect(dragging()).toBe(false);
    blocks[1].dispatchEvent(pointerEvent('pointermove', 2, 1, 59));
    expect(dragging()).toBe(true);
    blocks[1].dispatchEvent(pointerEvent('pointerup', 2, 1, 59));

    vi.useFakeTimers();
    try {
      blocks[1].dispatchEvent(pointerEvent('pointerdown', 3, 1, 60, 'touch'));
      expect(dragging()).toBe(false);
      // The hold is the one the rest of the app asks for, not a number of its own.
      vi.advanceTimersByTime(TOUCH_HOLD_DURATION - 1);
      expect(dragging()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(dragging()).toBe(true);
      blocks[1].dispatchEvent(pointerEvent('pointerup', 3, 1, 60, 'touch'));
    } finally {
      vi.useRealTimers();
    }
  });

  test('moves a selected top-level block only when dragging from its frame', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const expandedInput = document.createElement('div');
    expandedInput.className = 'chat-input is-message-input-expanded';
    input.before(expandedInput);
    expandedInput.append(input);
    editor.setTextWithEntities('First\nSecond\nThird');

    const blocks: HTMLElement[] = [];
    let position = 0;
    for(let index = 0; index < tiptap.state.doc.childCount - 1; ++index) {
      const block = tiptap.view.nodeDOM(position) as HTMLElement;
      blocks.push(block);
      vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
        bottom: (index + 1) * 40,
        height: 40,
        left: 0,
        right: 200,
        top: index * 40,
        width: 200,
        x: 0,
        y: index * 40,
        toJSON: () => ({})
      });
      position += tiptap.state.doc.child(index).nodeSize;
    }

    const pointerEvent = (
      type: string,
      pointerId: number,
      clientX: number,
      clientY: number,
      pointerType = 'mouse'
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX,
        clientY
      });
      Object.defineProperties(event, {
        isPrimary: {value: true},
        pointerId: {value: pointerId},
        pointerType: {value: pointerType}
      });
      return event;
    };
    const touchStartEvent = (clientX: number, clientY: number) => {
      const event = new Event('touchstart', {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'touches', {
        value: [{clientX, clientY}]
      });
      return event;
    };

    const interiorDown = pointerEvent('pointerdown', 1, 100, 60);
    blocks[1].dispatchEvent(interiorDown);
    expect(interiorDown.defaultPrevented).toBe(false);
    expect(input.querySelector('.chat-input-block-selected')?.textContent).toBe('Second');
    expect(input.classList.contains('chat-input-block-dragging')).toBe(false);
    const secondPosition = tiptap.state.doc.child(0).nodeSize + 1;
    editor.restoreSelection({from: secondPosition, to: secondPosition}, false);

    const interiorTouchStart = touchStartEvent(100, 60);
    blocks[1].dispatchEvent(interiorTouchStart);
    expect(interiorTouchStart.defaultPrevented).toBe(false);
    const frameTouchStart = touchStartEvent(1, 60);
    blocks[1].dispatchEvent(frameTouchStart);
    expect(frameTouchStart.defaultPrevented).toBe(true);

    const touchDown = pointerEvent('pointerdown', 3, 1, 60, 'touch');
    blocks[1].dispatchEvent(touchDown);
    expect(touchDown.defaultPrevented).toBe(true);
    blocks[1].dispatchEvent(pointerEvent('pointercancel', 3, 1, 60, 'touch'));

    blocks[1].dispatchEvent(pointerEvent('pointermove', 2, 1, 60));
    expect(blocks[1].classList.contains('chat-input-block-frame-hover')).toBe(true);

    const frameDown = pointerEvent('pointerdown', 2, 1, 60);
    blocks[1].dispatchEvent(frameDown);
    expect(frameDown.defaultPrevented).toBe(true);
    blocks[1].dispatchEvent(pointerEvent('pointermove', 2, 1, 1));
    expect(input.querySelector('.chat-input-block-drop-indicator')).not.toBeNull();
    blocks[1].dispatchEvent(pointerEvent('pointerup', 2, 1, 1));

    expect(logicalTopLevelText(tiptap)).toEqual(['Second', 'First', 'Third']);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.$from.index(0)).toBe(0);
    expect(input.querySelector('.chat-input-block-drop-indicator')).toBeNull();
  });
});
