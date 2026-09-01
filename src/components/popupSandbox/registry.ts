/*
 * The story registry: one entry per popup state worth looking at.
 *
 * A story owns everything the popup needs — the arguments AND the manager answers — so opening it is
 * a single click in the sandbox and a single call (`popupSandbox.open(id)`) from a test.
 */

import type {ManagerHandlers} from './mockManagers';
import type {PopupStoryContext} from './context';

export type PopupStory = {
  /** Stable across renames of the title — the automation API and the URL hash address stories by it. */
  id: string,
  title: string,
  group: string,
  /**
   * Manager answers this popup needs on top of the defaults, active while the story is open.
   * Fixture-mode only — running live these are ignored, the real managers already know the answers.
   */
  managers?: ManagerHandlers | ((ctx: PopupStoryContext) => ManagerHandlers),
  /**
   * `ctx` hands out the peers, messages and gifts the popup needs — fixtures, or the signed-in
   * session's own data when the sandbox runs live. Never reach for a fixture directly here.
   */
  open: (ctx: PopupStoryContext) => MaybePromise<void>,
  /** No live equivalent exists (a payment form, a gift code): always built from fixtures. */
  fixtureOnly?: boolean
};

const stories: PopupStory[] = [];

export function defineStories(group: string, groupStories: Array<Omit<PopupStory, 'group'>>) {
  for(const story of groupStories) {
    if(stories.some((existing) => existing.id === story.id)) {
      throw new Error(`popupSandbox: duplicate story id "${story.id}"`);
    }

    stories.push({...story, group});
  }
}

export function getStories() {
  return stories;
}

export function getStory(id: string) {
  return stories.find((story) => story.id === id);
}
