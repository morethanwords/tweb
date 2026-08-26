import {Show} from 'solid-js';
import {MyDocument} from '@appManagers/appDocsManager';
import Row from '@components/rowTsx';
import {StickerTsx} from '@components/wrappers/sticker';

export default function ReactionStickerPreview(props: {
  sticker?: MyDocument
}) {
  return (
    <Row.Media size="small">
      <Show when={props.sticker}>{(sticker) => (
        <StickerTsx
          sticker={sticker()}
          width={32}
          height={32}
        />
      )}</Show>
    </Row.Media>
  );
}
