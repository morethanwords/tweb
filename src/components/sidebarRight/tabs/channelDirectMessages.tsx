import {createEffect, createSignal, Show} from 'solid-js';
import {Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';
import throttle from '../../../helpers/schedulers/throttle';
import {i18n} from '../../../lib/langPack';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';
import Row from '../../rowTsx';
import Section from '../../section';
import SaveButton from '../../sidebarLeft/tabs/privacy/messages/saveButton';
import StarRangeInput from '../../sidebarLeft/tabs/privacy/messages/starsRangeInput';
import useIsConfirmationNeededOnClose from '../../sidebarLeft/tabs/privacy/messages/useIsConfirmationNeededOnClose';
import useStarsCommissionAndWithdrawalPrice from '../../sidebarLeft/tabs/privacy/messages/useStarsCommissionAndWithdrawalPrice';
import type {AppDirectMessagesTab} from '../../solidJsTabs';
import {useSuperTab} from '../../solidJsTabs/superTabProvider';
import StaticSwitch from '../../staticSwitch';


const ChannelDirectMessages = () => {
  const [tab] = useSuperTab<typeof AppDirectMessagesTab>();
  const {apiManagerProxy, rootScope} = useHotReloadGuard();

  const chat = tab.payload.chat;
  if(!chat) return <></>;

  const linkedChat = chat.linked_monoforum_id ? apiManagerProxy.getChat(chat.linked_monoforum_id) : undefined;

  const initialEnabled = !!linkedChat;
  const initialStars = linkedChat?._ === 'channel' ? +linkedChat.send_paid_messages_stars || 0 : 0

  const [enabled, setEnabled] = createSignal(initialEnabled);
  const [stars, setStars] = createSignal(initialStars);

  const [hasChanges, setHasChanges] = createSignal(false);

  const {commissionPercents, willReceiveDollars} = useStarsCommissionAndWithdrawalPrice(stars);

  const throttledSetHasChanges = throttle(setHasChanges, 200);

  createEffect(() => {
    throttledSetHasChanges(initialEnabled !== enabled() || (enabled() && initialStars !== stars()));
  });

  let isSaving = false;

  async function saveSettings() {
    if(isSaving) return;
    isSaving = true;

    try {
      await rootScope.managers.appChatsManager.updateChannelPaidMessagesPrice(
        chat.id,
        enabled() ? stars() : 0,
        enabled()
      );
      tab.close();
    } finally {
      isSaving = false;
    }
  }

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    saveAllSettings: saveSettings,
    hasChanges,
    descriptionLangKey: 'UnsavedChangesDescription.Channel'
  });

  return <>
    <Portal mount={tab.header}>
      <SaveButton hasChanges={hasChanges()} onClick={() => void saveSettings()} />
    </Portal>

    <Section caption='ChannelDirectMessages.Settings.SwitchLabelCaption'>
      <Row clickable={() => {setEnabled(!enabled())}}>
        <Row.Title>
          {i18n('ChannelDirectMessages.Settings.SwitchLabel')}
        </Row.Title>
        <Row.RightContent>
          <StaticSwitch checked={enabled()} />
        </Row.RightContent>
      </Row>
    </Section>

    <Transition name='fade'>
      <Show when={enabled()}>
        <Section
          name='PaidMessages.SetPrice'
          class='overflow-hidden'
          caption='PaidMessages.SetPriceChannelDescription'
          captionArgs={[commissionPercents(), willReceiveDollars()]}
        >
          <StarRangeInput value={stars()} onChange={setStars} startFromZero />
        </Section>
      </Show>
    </Transition>
  </>;
};

export default ChannelDirectMessages;
