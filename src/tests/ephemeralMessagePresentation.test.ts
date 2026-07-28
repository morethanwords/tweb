import {describe, expect, it} from 'vitest';
import {EPHEMERAL_MESSAGE_ID_OFFSET} from '@appManagers/constants';
import isSameMessageSelectionGroup from '@components/chat/isSameMessageSelectionGroup';
import placeEphemeralBadge, {
  shouldKeepSenderNameAcrossGroup,
  shouldRenderSenderNameWithEphemeralBadge
} from '@components/chat/placeEphemeralBadge';

describe('ephemeral message presentation', () => {
  it('keeps ephemeral and regular multiselect groups separate', () => {
    const selected = new Map<number, Set<number>>();

    expect(isSameMessageSelectionGroup(selected, false)).toBe(true);
    expect(isSameMessageSelectionGroup(selected, true)).toBe(true);

    selected.set(1, new Set([10]));
    expect(isSameMessageSelectionGroup(selected, false)).toBe(true);
    expect(isSameMessageSelectionGroup(selected, true)).toBe(false);

    selected.set(1, new Set([EPHEMERAL_MESSAGE_ID_OFFSET + 1]));
    expect(isSameMessageSelectionGroup(selected, false)).toBe(false);
    expect(isSameMessageSelectionGroup(selected, true)).toBe(true);

    selected.clear();
    expect(isSameMessageSelectionGroup(selected, false)).toBe(true);
    expect(isSameMessageSelectionGroup(selected, true)).toBe(true);
  });

  it('places the badge inside the name stack before the topic chip', () => {
    const container = document.createElement('div');
    const name = document.createElement('div');
    const sender = document.createElement('span');
    const topic = document.createElement('div');
    const content = document.createElement('div');
    const badge = document.createElement('div');
    topic.classList.add('topic-name-button-container', 'bubble-name-chip-container');
    name.append(sender, topic);
    container.append(name, content);

    placeEphemeralBadge(container, name, badge);

    expect([...name.children]).toEqual([sender, badge, topic]);
    expect([...container.children]).toEqual([name, content]);
  });

  it('places the badge after the sender when there is no topic chip', () => {
    const container = document.createElement('div');
    const name = document.createElement('div');
    const sender = document.createElement('span');
    const content = document.createElement('div');
    const badge = document.createElement('div');
    name.append(sender);
    container.append(name, content);

    placeEphemeralBadge(container, name, badge);

    expect([...name.children]).toEqual([sender, badge]);
    expect([...container.children]).toEqual([name, content]);
  });

  it('places the badge first when there is no rendered sender name', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');
    const badge = document.createElement('div');
    container.append(content);

    placeEphemeralBadge(container, undefined, badge);

    expect(container.firstElementChild).toBe(badge);
  });

  it('renders a standalone plate when unwrapped media has no sender name', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');
    const badge = document.createElement('div');
    container.append(content);

    placeEphemeralBadge(container, undefined, badge, true);

    expect(container.firstElementChild).toBe(badge);
    expect(badge.classList.contains('floating-part')).toBe(true);
    expect(badge.classList.contains('ephemeral-badge-standalone')).toBe(true);
  });

  it('keeps the sender name for standalone ephemeral media only', () => {
    expect(shouldRenderSenderNameWithEphemeralBadge(true, false, false)).toBe(true);
    expect(shouldRenderSenderNameWithEphemeralBadge(true, true, false)).toBe(false);
    expect(shouldRenderSenderNameWithEphemeralBadge(true, true, true)).toBe(true);
    expect(shouldRenderSenderNameWithEphemeralBadge(false, true, true)).toBe(false);
  });

  it('keeps the sender name on every grouped incoming ephemeral bubble', () => {
    expect(shouldKeepSenderNameAcrossGroup(true, false)).toBe(true);
    expect(shouldKeepSenderNameAcrossGroup(true, true)).toBe(false);
    expect(shouldKeepSenderNameAcrossGroup(false, false)).toBe(false);
    expect(shouldKeepSenderNameAcrossGroup(false, true)).toBe(false);
  });
});
