import {createPopup} from '@components/popups/indexTsx';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import CreateTonePopup, {CreateTonePopupProps} from './CreateTonePopup';


export default function showCreateTonePopup(props: CreateTonePopupProps & {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
}) {
  const {HotReloadGuard, ...rest} = props;
  createPopup(() => (
    <HotReloadGuard>
      <CreateTonePopup {...rest} />
    </HotReloadGuard>
  ));
}
