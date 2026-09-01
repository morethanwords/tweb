import {createMemo, createSignal, For, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {useAppSettings} from '@stores/appSettings';
import {AppTheme} from '@config/state';
import {setSandboxTheme} from './environment';
import {getStories, PopupStory} from './registry';
import styles from './sandbox.module.scss';

export type SandboxProps = {
  onOpen: (story: PopupStory) => void,
  /** Set only when the sandbox is an overlay over a running app — closing it restores the app. */
  onClose?: () => void,
  activeId: () => string,
  unhandled: () => string[],
  /** Whether this session has real data to offer. */
  canGoLive: boolean,
  /**
   * Only the standalone sandbox owns the theme. Over a running app the app's own switcher does,
   * and changing it from here would outlive the panel.
   */
  canSetTheme: boolean,
  dataSource: () => 'fixtures' | 'live',
  setDataSource: (source: 'fixtures' | 'live') => void,
  /** Peer kinds the account has none of; those stories fall back to fixtures. */
  liveGaps: () => string[],
  /** The open story had fixture manager answers that live mode does not apply. */
  droppedOverrides: () => boolean,
  allowWrites: () => boolean,
  setAllowWrites: (value: boolean) => void
};

export default function PopupSandboxPanel(props: SandboxProps) {
  const [collapsed, setCollapsed] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [appSettings] = useAppSettings();

  // Derived from the themes the app actually ships rather than a second list to keep in sync; the
  // raw names are also what `appSettings.theme` and the SCSS use, so they read better here than
  // localized labels would.
  const themeNames = createMemo<AppTheme['name'][]>(() => [
    'system',
    ...appSettings.themes.map((theme) => theme.name)
  ]);

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const stories = getStories();
    const matching = q ?
      stories.filter((story) => (story.id + ' ' + story.title + ' ' + story.group).toLowerCase().includes(q)) :
      stories;

    const groups: Array<{name: string, stories: PopupStory[]}> = [];
    for(const story of matching) {
      let group = groups.find((g) => g.name === story.group);
      if(!group) groups.push(group = {name: story.group, stories: []});
      group.stories.push(story);
    }

    return groups;
  });

  const total = createMemo(() => filtered().reduce((sum, group) => sum + group.stories.length, 0));

  return (
    <div
      class={classNames(styles.Panel, collapsed() && styles.Collapsed)}
      role="complementary"
      aria-label="Popup sandbox"
      aria-hidden={collapsed() || undefined}
    >
      <button
        class={styles.Toggle}
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed()}
      >
        {collapsed() ? 'Stories ▸' : '◂ Hide'}
      </button>

      <div class={styles.Header}>
        <span>Popup sandbox <span class={styles.Count}>{total()}</span></span>
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
        </Show>
      </div>

      <input
        class={styles.Search}
        type="search"
        placeholder="Filter popups…"
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />

      <Show when={props.canGoLive}>
        <div class={styles.Source}>
          <label>
            <input
              type="radio"
              name="popup-sandbox-source"
              checked={props.dataSource() === 'fixtures'}
              onChange={() => props.setDataSource('fixtures')}
            />
            Fixtures
          </label>
          <label>
            <input
              type="radio"
              name="popup-sandbox-source"
              checked={props.dataSource() === 'live'}
              onChange={() => props.setDataSource('live')}
            />
            My data
          </label>
        </div>
      </Show>

      <Show when={props.dataSource() === 'live'}>
        <label class={classNames(styles.Notice, props.allowWrites() && styles.Danger)}>
          <input
            type="checkbox"
            checked={props.allowWrites()}
            onChange={(e) => props.setAllowWrites(e.currentTarget.checked)}
          />
          {' '}Let popups write
          <div>
            {props.allowWrites() ?
              'Confirm buttons do the real thing — delete, leave, pay. There is no undo.' :
              'Reads only. Confirm buttons resolve to nothing and are listed below.'}
          </div>
          <Show when={props.liveGaps().length}>
            <div>No {props.liveGaps().join(', ')} in this account — those stories use fixtures.</div>
          </Show>
          <Show when={props.droppedOverrides()}>
            <div>This story's canned manager answers are not applied here — it reads the real ones.</div>
          </Show>
        </label>
      </Show>

      <Show when={props.onClose && props.dataSource() === 'fixtures'}>
        <div class={styles.Notice}>
          The popup layer is on mock data while this is open. Close it to give the app its managers back.
        </div>
      </Show>

      <div class={styles.List}>
        <Show when={total()} fallback={<div class={styles.Empty}>Nothing matches “{query()}”.</div>}>
          <For each={filtered()}>
            {(group) => (
              <>
                <div class={styles.Group}>{group.name}</div>
                <For each={group.stories}>
                  {(story) => (
                    <button
                      class={classNames(styles.Item, props.activeId() === story.id && styles.Active)}
                      data-story-id={story.id}
                      aria-current={props.activeId() === story.id || undefined}
                      onClick={() => props.onOpen(story)}
                    >
                      {story.title}
                      <span class={styles.ItemId}>
                        {story.id}
                        <Show when={props.dataSource() === 'live' && story.fixtureOnly}>
                          {' · fixtures'}
                        </Show>
                      </span>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </Show>
      </div>

      <Show when={props.unhandled().length}>
        <div class={styles.Footer}>
          <div class={styles.FooterTitle}>Unanswered manager calls</div>
          <For each={props.unhandled()}>
            {(call) => <div>{call}</div>}
          </For>
        </div>
      </Show>
    </div>
  );
}
