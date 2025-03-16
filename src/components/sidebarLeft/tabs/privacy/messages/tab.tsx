import {createMemo, createSignal, Show} from 'solid-js';
import {Portal} from 'solid-js/web';

import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import anchorCallback from '../../../../../helpers/dom/anchorCallback';
import {i18n} from '../../../../../lib/langPack';

import StaticRadio from '../../../../staticRadio';
import ripple from '../../../../ripple'; ripple; // keep
import {IconTsx} from '../../../../iconTsx';
import Section from '../../../../section';
import RowTsx from '../../../../rowTsx';

import {useSuperTab} from '../../solidJsTabs/superTabProvider';

import AppearZoomTransition from './appearZoomTransition';
import StarRangeInput from './starsRangeInput';


const MessagesTab = () => {
  const [tab, {AppAddMembersTab}] = useSuperTab();
  const {PopupPremium} = useHotReloadGuard();

  const [state, setState] = createSignal(0);
  const [stars, setStars] = createSignal(1);

  const [peers, setPeers] = createSignal<number[]>([]);

  const hasChanges = createMemo(() => !!state());

  return (
    <>
      <Portal mount={tab.header}>
        <AppearZoomTransition>
          <Show when={hasChanges()}>
            <button
              use:ripple
              class="btn-icon blue"
            >
              <IconTsx icon='check' />
            </button>
          </Show>
        </AppearZoomTransition>
      </Portal>

      <Section
        name='PrivacyMessagesTitle'
        caption='Privacy.MessagesInfo'
        captionArgs={[anchorCallback(() => void PopupPremium.show())]}
      >
        <RowTsx
          checkboxField={<StaticRadio floating checked={state() === 0} />}
          clickable={() => {setState(0)}}
          title={i18n('PrivacySettingsController.Everbody')}
        />
        <RowTsx
          checkboxField={<StaticRadio floating checked={state() === 1} />}
          clickable={() => {setState(1)}}
          title={i18n('Privacy.ContactsAndPremium')}
        />
        <RowTsx
          checkboxField={<StaticRadio floating checked={state() === 2} />}
          clickable={() => {setState(2)}}
          title={i18n('PrivacySettingsController.Nobody')}
        />
      </Section>

      <Section
        name='PaidMessages.SetPrice'
        caption='PaidMessages.SetPriceDescription'
        captionArgs={[10.12]}
      >
        <StarRangeInput value={stars()} onChange={setStars} />
      </Section>

      <Section
        name='PrivacyExceptions'
        caption='PaidMessages.RemoveFeeDescription'
      >
        <RowTsx
          title={i18n('PaidMessages.RemoveFee')}
          rightContent={(() => {
            const el = peers().length ?
              i18n('Users', [peers().length]) :
              i18n('PrivacySettingsController.AddUsers');

            el.classList.add('primary');
            return el;
          })()}
          clickable={() => {
            tab.slider.createTab(AppAddMembersTab).open({
              type: 'privacy',
              skippable: true,
              title: 'PaidMessages.RemoveFee',
              placeholder: 'PrivacyModal.Search.Placeholder',
              takeOut: (newPeerIds) => {
                setPeers(newPeerIds);
              },
              selectedPeerIds: peers()
            });
          }}
        />
      </Section>
    </>
  );
};

export default MessagesTab;
