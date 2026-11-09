import {afterEach, describe, expect, it} from 'vitest';
import {DETAILS_CONTENT_CLASS, expandDetailsAncestors, expandTextMatchDetails, registerDetails} from '@components/instantView/details';

// * a rich message's text with details blocks in it, as the renderer draws them: a title, and a collapsible part
// * registered with its open state (the text is found as the blocks' texts run together); a jump that lights a match up opens the collapsed ones holding it, and only those

type FakeDetails = {
  element: HTMLElement,
  content: HTMLElement,
  isOpen: () => boolean,
  opens: {transition: string}[]
};

function paragraph(text: string) {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

function details(title: string, children: Node[], open = false): FakeDetails {
  const element = document.createElement('div');
  const summary = document.createElement('button');
  summary.textContent = title;
  const content = document.createElement('div');
  content.classList.add(DETAILS_CONTENT_CLASS);
  content.append(...children);
  element.append(summary, content);

  let opened = open;
  const opens: FakeDetails['opens'] = [];
  registerDetails(content, {
    isOpen: () => opened,
    setOpen: (value) => {
      opens.push({transition: content.style.transition});
      opened = value;
    }
  });

  return {element, content, isOpen: () => opened, opens};
}

function message(...children: Node[]) {
  const container = document.createElement('div');
  container.append(...children);
  document.body.append(container);
  return container;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('details opened for a highlighted match', () => {
  it('opens the collapsed details the quote is inside, at once, and leaves its transition as it was', () => {
    const hidden = details('More', [paragraph('hidden words here')]);
    const container = message(paragraph('visible start'), hidden.element);

    expect(expandTextMatchDetails(container, {type: 'quote', text: 'hidden words'})).toBe(true);
    expect(hidden.isOpen()).toBe(true);
    expect(hidden.opens).toEqual([{transition: 'none'}]);
    expect(hidden.content.style.transition).toBe('');
  });

  it('opens every level of nested details around the match, and no other details of the message', () => {
    const inner = details('Inner', [paragraph('deep quoted text')]);
    const outer = details('Outer', [paragraph('outer text'), inner.element]);
    const sibling = details('Sibling', [paragraph('unrelated words')]);
    const innerSibling = details('Inner sibling', [paragraph('other deep words')]);
    outer.content.append(innerSibling.element);
    const container = message(paragraph('start'), outer.element, sibling.element);

    expandTextMatchDetails(container, {type: 'quote', text: 'deep quoted'});
    expect(outer.isOpen()).toBe(true);
    expect(inner.isOpen()).toBe(true);
    expect(sibling.isOpen()).toBe(false);
    expect(innerSibling.isOpen()).toBe(false);
  });

  it('opens a details the quote is only partly inside', () => {
    const hidden = details('More', [paragraph('tail inside')]);
    const container = message(paragraph('before the block'), hidden.element, paragraph('after'));

    expandTextMatchDetails(container, {type: 'quote', text: 'the blockMoretail'});
    expect(hidden.isOpen()).toBe(true);
  });

  it('opens a details the quote takes in wholly, between text outside it', () => {
    const hidden = details('More', [paragraph('middle')]);
    const container = message(paragraph('first part'), hidden.element, paragraph('last part'));

    expandTextMatchDetails(container, {type: 'quote', text: 'partMoremiddlelast'});
    expect(hidden.isOpen()).toBe(true);
  });

  it('leaves an open details alone', () => {
    const shown = details('More', [paragraph('hidden words here')], true);
    const container = message(shown.element);

    expect(expandTextMatchDetails(container, {type: 'quote', text: 'hidden words'})).toBe(false);
    expect(shown.opens).toEqual([]);
  });

  it('opens nothing for a match outside details, or in a details title alone', () => {
    const hidden = details('Title words', [paragraph('hidden words here')]);
    const container = message(paragraph('visible start'), hidden.element);

    expect(expandTextMatchDetails(container, {type: 'quote', text: 'visible start'})).toBe(false);
    expect(expandTextMatchDetails(container, {type: 'quote', text: 'Title words'})).toBe(false);
    expect(hidden.opens).toEqual([]);
  });

  it('opens the details of the first search match only, the one a jump scrolls to', () => {
    const first = details('One', [paragraph(' needle one')]);
    const second = details('Two', [paragraph(' needle two')]);
    const container = message(first.element, second.element);

    expandTextMatchDetails(container, {type: 'search', query: 'needle'});
    expect(first.isOpen()).toBe(true);
    expect(second.isOpen()).toBe(false);
  });

  it('does nothing in a message without details', () => {
    const container = message(paragraph('plain text'));
    expect(expandTextMatchDetails(container, {type: 'quote', text: 'plain'})).toBe(false);
  });
});

describe('details opened around an anchor', () => {
  it('opens every collapsed details around the element with its transition', () => {
    const target = paragraph('anchor target');
    const inner = details('Inner', [target]);
    const outer = details('Outer', [inner.element]);
    message(outer.element);

    expect(expandDetailsAncestors(target)).toBe(true);
    expect(inner.opens).toEqual([{transition: ''}]);
    expect(outer.opens).toEqual([{transition: ''}]);
  });
});
