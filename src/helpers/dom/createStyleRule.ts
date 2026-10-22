import {onBeforeAppWindowChange} from '@helpers/appWindow';

// * every rule in use, written out whole before the app moves into another window (Document PiP) and
// * back: a `<style>` put into a document is parsed anew from its text, which the CSSOM changes never touched
const rules: Set<() => void> = new Set();
let watchingWindow: boolean;

/**
 * A rule of its own, in a `<style>` put into `parent`, for giving properties to just the elements
 * `selector` matches. A custom property set on a container is worked out anew for every element in
 * it - a chat, a chat list: a thousand elements and more - while a rule changed through the CSSOM has
 * only the elements it matches restyled (with a registered custom property that is not inherited,
 * only them and not what is inside them). Writing the `<style>`'s text instead would have the page
 * take the sheet in anew each time. The `<style>` goes with `parent` wherever it is moved, a Document
 * PiP window included. `remove` takes it away, with `parent` still in use.
 */
export default function createStyleRule(parent: HTMLElement, selector: string) {
  const style = document.createElement('style');
  const values: Map<string, string> = new Map();
  // * the rule the values were last given to: a sheet made anew (the `<style>` taken out of the
  // * document and put back) has another, written from the text
  let rule: CSSStyleRule;

  const write = () => {
    if(style.parentElement !== parent) {
      parent.prepend(style);
    }

    style.textContent = `${selector} {${[...values].map(([property, value]) => `${property}: ${value}`).join('; ')}}`;
    rule = style.isConnected ? style.sheet?.cssRules[0] as CSSStyleRule : undefined;
  };

  const sync = () => {
    if(values.size) {
      write();
    }
  };

  rules.add(sync);
  if(!watchingWindow) {
    watchingWindow = true;
    onBeforeAppWindowChange(() => rules.forEach((sync) => sync()));
  }

  return {
    set(property: string, value: string) {
      if(!rule || rule !== (style.isConnected && style.sheet?.cssRules[0])) {
        values.set(property, value);
        write();
        return;
      }

      if(values.get(property) === value) {
        return;
      }

      values.set(property, value);
      rule.style.setProperty(property, value);
    },

    remove() {
      rules.delete(sync);
      style.remove();
    }
  };
}
