import inlineRippleLinkStyles from '@/scss/modulePartials/inlineRippleLink.module.scss';
import ripple from '@components/ripple';
import {keepMe} from '@helpers/keepMe';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

keepMe(ripple);


export const CreatorLink = (props: {
  peerId: number;
  onClick?: () => void;
}) => {
  const {appImManager, PeerTitleTsx} = useHotReloadGuard();

  return (
    <span
      class={inlineRippleLinkStyles.inlineRippleLink}
      use:ripple
      onClick={() => {
        appImManager.setInnerPeer({peerId: props.peerId});
        props.onClick?.();
      }}
    >
      <PeerTitleTsx peerId={props.peerId} limitSymbols={32} />
    </span>
  );
};
