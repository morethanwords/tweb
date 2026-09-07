import {IconTsx} from '@components/iconTsx';
import MediaHeader from '@components/mediaHeader';
import styles from '@components/call/callLogo.module.scss';

/**
 * The filled disc a call box is crowned with — the handset for the join box,
 * the link glyph for the Call Link one. tdesktop draws both with the same
 * widget (`MakeRoundActiveLogo` / `MakeJoinCallLogo`).
 */
export default function CallLogo(props: {icon: Icon}) {
  return (
    <MediaHeader.Sticker
      size={80}
      element={(
        <div class={styles.logo}>
          <IconTsx icon={props.icon} />
        </div>
      )}
    />
  );
}
