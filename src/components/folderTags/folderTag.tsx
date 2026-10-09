import {JSX} from 'solid-js';
import type {TextWithEntities} from '@layer';
import classNames from '@helpers/string/classNames';
import FolderTitleTsx from '@components/folderTitleTsx';
import styles from '@components/folderTags/folderTag.module.scss';

/** The colour of a "+N" tag: blue, as on Desktop and Android */
export const FOLDER_TAG_MORE_COLOR = 5;

/** What gives an element `--folder-tag-color-rgb`, the colour of a tag */
export const getFolderTagColorClassName = (color: number) => styles[`color${color}` as keyof typeof styles];

/** A folder's colour on its own, where the folder is listed rather than a chat tagged with it */
export function FolderTagColorDot(props: {color: number, class?: string}) {
  return <span class={classNames(styles.dot, getFolderTagColorClassName(props.color), props.class)} />;
}

/** A folder's tag: its title in its colour - or, without a title, whatever is put in it */
export default function FolderTag(props: {
  color: number,
  title?: TextWithEntities,
  class?: string,
  children?: JSX.Element
}) {
  return (
    <span class={classNames(styles.tag, getFolderTagColorClassName(props.color), 'folder-tag', props.class)}>
      {props.title ? <FolderTitleTsx title={props.title} /> : props.children}
    </span>
  );
}
