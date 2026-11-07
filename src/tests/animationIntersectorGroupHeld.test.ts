import {describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({idle: false}));

vi.mock('@config/debug', () => ({MOUNT_CLASS_TO: undefined, DEBUG: false}));
vi.mock('@stores/appSettings', () => ({useAppSettings: () => [{stickers: {loop: true}}]}));
vi.mock('@helpers/idleController', () => ({default: {
  get isIdle() { return state.idle; },
  addEventListener: vi.fn()
}}));
vi.mock('@helpers/appWindow', () => ({
  onAppWindowChange: vi.fn(),
  getAppWindow: () => ({IntersectionObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }})
}));

import animationIntersector from '@components/animationIntersector';

/**
 * What plays from the start (a widget) is paused as it is added where the observer will not say to: the window idle,
 * or its group held as it is — a chat kept behind a thread open over it.
 */
describe('a group held as it is', () => {
  it('is one whose chat is kept behind another, until it is let go', () => {
    expect(animationIntersector.isGroupHeld('chat-1')).toBe(false);
    animationIntersector.toggleIntersectionGroup('chat-1', true);
    expect(animationIntersector.isGroupHeld('chat-1')).toBe(true);
    expect(animationIntersector.isGroupHeld('chat-2')).toBe(false);
    animationIntersector.toggleIntersectionGroup('chat-1', false);
    expect(animationIntersector.isGroupHeld('chat-1')).toBe(false);
  });

  it('is every group while the window is idle, but one that plays on anyway (the reactions menu)', () => {
    state.idle = true;
    expect(animationIntersector.isGroupHeld('chat-1')).toBe(true);
    animationIntersector.setOverrideIdleGroup('CHAT-MENU-REACTIONS-1', true);
    expect(animationIntersector.isGroupHeld('CHAT-MENU-REACTIONS-1')).toBe(false);
    animationIntersector.setOverrideIdleGroup('CHAT-MENU-REACTIONS-1', false);
    state.idle = false;
  });
});
