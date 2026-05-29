import {createPopup} from '@components/popups/indexTsx';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';

import CreateBotPopup, {CreateBotPopupProps} from '@components/popups/createBot/CreateBotPopup';

export default function showCreateBotPopup(props: CreateBotPopupProps & {
  HotReloadGuard: typeof SolidJSHotReloadGuardProvider
}) {
  const {HotReloadGuard, ...rest} = props;
  createPopup(() => (
    <HotReloadGuard>
      <CreateBotPopup {...rest} />
    </HotReloadGuard>
  ));
}
