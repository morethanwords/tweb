import {For, JSX} from 'solid-js';
import Row from '@components/rowTsx';
import classNames from '@helpers/string/classNames';

import styles from '@components/featureRows.module.scss';

export type FeatureRow = {
  icon: Icon,
  title: JSX.Element,
  subtitle: JSX.Element
};

/**
 * The list a popup shows to say what something gives you: a bare icon in a lane of its own, a
 * bold line, and the explanation under it. The icon sits at the top of the row rather than in
 * its middle, so a two-line explanation does not push it out of line with the title.
 */
export default function FeatureRows(props: {
  rows: FeatureRow[]
}) {
  return (
    <For each={props.rows}>{(row) => (
      <Row class={/* @once */ styles.row}>
        <Row.Icon class={/* @once */ classNames('primary', styles.icon)} icon={row.icon} noBackground />
        <Row.Title class="text-bold">{row.title}</Row.Title>
        <Row.Subtitle class={/* @once */ styles.subtitle}>{row.subtitle}</Row.Subtitle>
      </Row>
    )}</For>
  );
}
