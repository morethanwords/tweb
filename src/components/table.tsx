import {For, JSX, untrack} from 'solid-js';
import {LangPackKey, i18n} from '../lib/langPack';
import {AvatarNew} from './avatarNew';
import {PeerTitleTsx} from './stories/list';

export default function Table(props: {
  content: [LangPackKey, JSX.Element][]
}) {
  return (
    <table class="table">
      <For each={props.content}>
        {([key, value]) => {
          return (
            <tr class="table-row">
              <td class="table-cell table-key">{i18n(key)}</td>
              <td class="table-cell">{value}</td>
            </tr>
          );
        }}
      </For>
    </table>
  );
}

export function TablePeer(props: {peerId: PeerId, onClick: () => void}) {
  const avatar = untrack(() => AvatarNew({peerId: props.peerId, size: 24}));
  return (
    <div
      class="table-peer"
      onClick={props.onClick}
    >
      {avatar.element}
      <PeerTitleTsx peerId={props.peerId} />
    </div>
  );
}
