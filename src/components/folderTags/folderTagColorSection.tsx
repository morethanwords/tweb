import {Accessor, For, onCleanup, onMount, Show} from 'solid-js';
import type {TextWithEntities} from '@layer';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {DialogColors} from '@appManagers/utils/peers/dialogColors';
import classNames from '@helpers/string/classNames';
import getUnsafeRandomInt from '@helpers/number/getUnsafeRandomInt';
import {attachPickerGrid} from '@helpers/dom/attachListNavigation';
import Section from '@components/section';
import {IconTsx} from '@components/iconTsx';
import FolderTag, {FolderTagColorDot, getFolderTagColorClassName} from '@components/folderTags/folderTag';
import {FOLDER_TAG_COLORS_COUNT, useFolderTagsShown} from '@stores/folderTags';
import usePremium from '@stores/premium';
import usePremiumFeaturesHidden from '@stores/premiumFeaturesHidden';
import styles from '@components/folderTags/folderTagColorSection.module.scss';

const COLOR_NAMES: {[color in typeof DialogColors[number]]: LangPackKey} = {
  red: 'ColorRed',
  orange: 'ColorOrange',
  violet: 'ColorViolet',
  green: 'ColorGreen',
  cyan: 'ColorCyan',
  blue: 'ColorBlue',
  pink: 'ColorPink'
};

/** A colour for a new folder while the tags are on - one picked at random, as Android does */
export function getNewFolderTagColor() {
  return getUnsafeRandomInt(0, FOLDER_TAG_COLORS_COUNT - 1);
}

/**
 * "Folder color in chat list", on the screen that edits a folder: the colours its tag can wear and
 * none, with the tag as it will look above them. It is there while the tags are on - and, locked,
 * for an account without Premium, which is how such an account learns of them (Desktop, Android).
 */
export default function FolderTagColorSection(props: {
  title: Accessor<TextWithEntities>,
  color: Accessor<number>,
  onChange: (color: number | undefined) => void,
  /** a colour picked without Premium: what offers it */
  onLocked: () => void
}) {
  const isPremium = usePremium();
  const premiumFeaturesHidden = usePremiumFeaturesHidden();
  const tagsShown = useFolderTagsShown();

  const shown = () => !premiumFeaturesHidden() && (tagsShown() || !isPremium());
  // * a folder keeps the colour it was given while its account had Premium, and wears no tag
  const selected = () => isPremium() ? props.color() : undefined;

  const select = (color: number | undefined) => {
    if(!isPremium()) {
      props.onLocked();
      return;
    }

    props.onChange(color);
  };

  const preview = () => {
    const color = selected();
    const title = props.title();
    if(color !== undefined) {
      // * a folder with no name yet has no tag to show, only its colour picked below
      return title?.text ? <FolderTag class={styles.preview} color={color} title={title} /> : undefined;
    }

    const key: LangPackKey = color === undefined && props.color() !== undefined && !isPremium() ?
      'FolderTagNoColorPremium' :
      'FolderTagNoColor';
    return <span class={styles.noTag}>{i18n(key)}</span>;
  };

  const Colors = () => {
    let list: HTMLDivElement;
    onMount(() => {
      onCleanup(attachPickerGrid(list, '.' + styles.option));
    });

    return (
      <div ref={list} class={styles.colors}>
        <For each={DialogColors.map((color) => COLOR_NAMES[color])}>
          {(name, color) => (
            <div
              class={classNames(styles.option, getFolderTagColorClassName(color()), selected() === color() && styles.selected)}
              aria-pressed={selected() === color()}
              aria-label={I18n.format(name, true)}
              onClick={() => select(color())}
            >
              <FolderTagColorDot class={styles.circle} color={color()} />
            </div>
          )}
        </For>
        <div
          class={classNames(styles.option, selected() === undefined && styles.selected)}
          aria-pressed={selected() === undefined}
          aria-label={I18n.format('FolderTagNoColor', true)}
          onClick={() => select(undefined)}
        >
          <span class={classNames(styles.circle, styles.none)}>
            <IconTsx icon={isPremium() ? 'close' : 'premium_lock'} />
          </span>
        </div>
      </div>
    );
  };

  return (
    <div class={styles.wrapper}>
      <Show when={shown()}>
        <Section
          name="FolderTagColor"
          nameRight={preview()}
          caption="FolderTagColorInfo"
        >
          <Colors />
        </Section>
      </Show>
    </div>
  );
}
