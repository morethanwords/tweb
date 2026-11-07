import {Accessor, createEffect, createMemo, createSignal, For, JSX, onCleanup, onMount, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {useAppSettings} from '@stores/appSettings';
import {AppTheme} from '@config/state';
import {getSandboxDirection, SandboxDirection, setSandboxDirection, setSandboxTheme} from './environment';
import type {CheckedStories, StoryCheckedFilter} from './checkedStories';
import styles from './sandbox.module.scss';

/*
 * The panel a sandbox is driven from — the popup sandbox's and the widget sandbox's: a story list in
 * groups with a search, "looked at" marks and a filter over them, the theme, and whatever controls
 * and footer the sandbox adds.
 */

export type SandboxStory = {id: string, title: string, group: string};

/** The three ways to slice the list by what has been looked at. Order is the order they render in. */
const CHECKED_FILTERS: Array<{id: StoryCheckedFilter, label: string}> = [
  {id: 'all', label: 'All'},
  {id: 'unchecked', label: 'Unchecked'},
  {id: 'checked', label: 'Checked'}
];

/**
 * The list as the search and the checked filter leave it. Built by the sandbox rather than inside
 * the panel, so what is listed can be shown elsewhere too (the widget sandbox's "all" view).
 */
export function createStoryList<T extends SandboxStory>(stories: Accessor<T[]>, checked: CheckedStories) {
  const [query, setQuery] = createSignal('');

  const matchingQuery = createMemo(() => {
    const q = query().trim().toLowerCase();
    return q ?
      stories().filter((story) => (story.id + ' ' + story.title + ' ' + story.group).toLowerCase().includes(q)) :
      stories();
  });

  // Counted within the search, not over the whole registry: while a query is up, what a reviewer
  // wants to know is how much of THAT is still to look at.
  const counts = createMemo(() => {
    const list = matchingQuery();
    const checkedCount = list.filter((story) => checked.isChecked(story.id)).length;
    return {all: list.length, checked: checkedCount, unchecked: list.length - checkedCount};
  });

  const groups = createMemo(() => {
    const result: Array<{name: string, stories: T[]}> = [];
    for(const story of matchingQuery()) {
      if(!checked.matchesFilter(story.id)) continue;
      let group = result.find((g) => g.name === story.group);
      if(!group) result.push(group = {name: story.group, stories: []});
      group.stories.push(story);
    }

    return result;
  });

  const visible = createMemo(() => groups().flatMap((group) => group.stories));

  return {query, setQuery, counts, groups, visible};
}

export type StoryList<T extends SandboxStory> = ReturnType<typeof createStoryList<T>>;

/** A row of buttons of which one is on — the checked filter, a sandbox's own switches. */
export function SandboxSegmented<T extends string>(props: {
  label: string,
  options: Array<{id: T, label: JSX.Element}>,
  value: () => T,
  onChange: (id: T) => void
}) {
  return (
    <div class={styles.Filter} role="group" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <button
            class={classNames(styles.FilterButton, props.value() === option.id && styles.FilterActive)}
            aria-pressed={props.value() === option.id}
            onClick={() => props.onChange(option.id)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** A titled list under the panel's stories, shown only while it has entries (what a sandbox logs). */
export function SandboxLog<T>(props: {title: string, entries: Accessor<T[]>, children: (entry: T) => JSX.Element}) {
  return (
    <Show when={props.entries().length}>
      <div class={styles.Footer}>
        <div class={styles.FooterTitle}>{props.title}</div>
        <For each={props.entries()}>
          {(entry) => <div>{props.children(entry)}</div>}
        </For>
      </div>
    </Show>
  );
}

export default function SandboxPanel<T extends SandboxStory>(props: {
  /** The header, and the panel's accessible name. */
  title: string,
  searchPlaceholder: string,
  list: StoryList<T>,
  checked: CheckedStories,
  onOpen: (story: T) => void,
  activeId: () => string,
  /** Set only when the sandbox is an overlay over a running app — closing it restores the app. */
  onClose?: () => void,
  /**
   * Only a standalone sandbox owns the theme. Over a running app the app's own switcher does,
   * and changing it from here would outlive the panel.
   */
  canSetTheme: boolean,
  /**
   * The panel's width in px as it is drawn, at first and as its handle resizes it: what the sandbox beside it keeps
   * clear of it by.
   */
  onWidth?: (width: number) => void,
  /** Appended to a story's id line. */
  itemNote?: (story: T) => JSX.Element,
  /** The sandbox's own controls, under the checked filter. */
  children?: JSX.Element,
  footer?: JSX.Element
}) {
  const [collapsed, setCollapsed] = createSignal(false);
  const [appSettings] = useAppSettings();

  // Derived from the themes the app actually ships rather than a second list to keep in sync; the
  // raw names are also what `appSettings.theme` and the SCSS use, so they read better here than
  // localized labels would.
  const themeNames = createMemo<AppTheme['name'][]>(() => [
    'system',
    ...appSettings.themes.map((theme) => theme.name)
  ]);

  const total = createMemo(() => props.list.visible().length);

  const emptyMessage = () => {
    if(props.list.query().trim()) return `Nothing matches “${props.list.query()}”.`;
    return props.checked.filter() === 'checked' ?
      'Nothing is marked as checked yet.' :
      'Everything is checked off.';
  };

  // The sandbox reloads on every edit and reopens the story from the hash, so the active one is
  // usually somewhere far down a list that came back scrolled to the top. `nearest` leaves it alone
  // when it is already on screen — clicking an item never scrolls the list under the cursor.
  let list!: HTMLDivElement, panel!: HTMLDivElement;
  // its own window's observer: in a Document PiP window the tab's would see no change while the tab is out of sight
  onMount(() => {
    if(!props.onWidth) return;
    const observer = new (panel.ownerDocument.defaultView as typeof window).ResizeObserver(([entry]) => {
      props.onWidth(entry.borderBoxSize[0]?.inlineSize ?? panel.offsetWidth);
    });
    observer.observe(panel);
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => {
    const active = props.activeId();
    if(!active) return;
    list.querySelector(`[data-story-id="${CSS.escape(active)}"]`)?.scrollIntoView({block: 'nearest'});
  });

  return (
    // the panel's keys are its own: over a running app the chat's keys (Enter on a focused button sends its draft, a
    // letter goes to its composer) listen on the body, and the panel leaves the app usable beside it
    <div class={classNames(styles.Dock, collapsed() && styles.Collapsed)} on:keydown={(e) => e.stopPropagation()}>
      <button
        class={styles.Toggle}
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed()}
      >
        {collapsed() ? 'Stories ▸' : '◂ Hide'}
      </button>

      <div
        ref={panel}
        class={classNames(styles.Panel, styles.NativeControls)}
        role="complementary"
        aria-label={props.title}
        aria-hidden={collapsed() || undefined}
      >
        <div class={styles.Header}>
          <span>
            {props.title}{' '}
            {/* How many are listed; the filter row below breaks that down into checked and not. */}
            <span class={styles.Count}>{total()}</span>
          </span>
          <Show when={props.checked.count()}>
            <button
              class={styles.Clear}
              title="Forget which stories are marked as checked"
              onClick={() => props.checked.clear()}
            >
              reset ✓
            </button>
          </Show>
          <Show when={props.onClose}>
            <button class={styles.Close} title="Close and restore the app" onClick={() => props.onClose()}>×</button>
          </Show>
          <Show when={props.canSetTheme}>
            <select
              class={styles.Theme}
              title="Theme"
              onChange={(e) => setSandboxTheme(e.currentTarget.value as AppTheme['name'])}
            >
              <For each={themeNames()}>
                {(name) => <option value={name} selected={name === appSettings.theme}>{name}</option>}
              </For>
            </select>
            <select
              class={styles.Theme}
              title="Direction"
              onChange={(e) => setSandboxDirection(e.currentTarget.value as SandboxDirection)}
            >
              <For each={['ltr', 'rtl'] as SandboxDirection[]}>
                {(dir) => <option value={dir} selected={dir === getSandboxDirection()}>{dir}</option>}
              </For>
            </select>
          </Show>
        </div>

        <input
          class={styles.Search}
          type="search"
          placeholder={props.searchPlaceholder}
          value={props.list.query()}
          onInput={(e) => props.list.setQuery(e.currentTarget.value)}
        />

        <SandboxSegmented
          label="Show"
          options={CHECKED_FILTERS.map((filter) => ({
            id: filter.id,
            label: <>{filter.label} <span class={styles.FilterCount}>{props.list.counts()[filter.id]}</span></>
          }))}
          value={props.checked.filter}
          onChange={props.checked.setFilter}
        />

        <div class={styles.Controls}>
          {props.children}
        </div>

        <div class={styles.List} ref={list}>
          <Show when={total()} fallback={<div class={styles.Empty}>{emptyMessage()}</div>}>
            <For each={props.list.groups()}>
              {(group) => (
                <>
                  <div class={styles.Group}>{group.name}</div>
                  <For each={group.stories}>
                    {(story) => (
                      <div
                        class={classNames(
                          styles.Item,
                          props.activeId() === story.id && styles.Active,
                          props.checked.isChecked(story.id) && styles.Checked
                        )}
                        data-story-id={story.id}
                      >
                        <input
                          class={styles.Check}
                          type="checkbox"
                          title="I have looked at this one"
                          aria-label={`Mark “${story.title}” as checked`}
                          checked={props.checked.isChecked(story.id)}
                          onChange={(e) => props.checked.setChecked(story.id, e.currentTarget.checked)}
                        />
                        <button
                          class={styles.ItemOpen}
                          aria-current={props.activeId() === story.id || undefined}
                          onClick={() => props.onOpen(story)}
                        >
                          {story.title}
                          <span class={styles.ItemId}>
                            {story.id}
                            {props.itemNote?.(story)}
                          </span>
                        </button>
                      </div>
                    )}
                  </For>
                </>
              )}
            </For>
          </Show>
        </div>

        {props.footer}
      </div>
    </div>
  );
}
