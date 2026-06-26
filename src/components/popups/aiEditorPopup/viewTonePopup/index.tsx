import {createPopup} from '@components/popups/indexTsx';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import ViewTonePopup, {ViewTonePopupProps} from './ViewTonePopup';


export default function showViewTonePopup(props: ViewTonePopupProps & {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
}) {
  const {HotReloadGuard, ...rest} = props;
  createPopup(() => (
    <HotReloadGuard>
      <ViewTonePopup {...rest} />
    </HotReloadGuard>
  ));
}
