import {Component, Show} from 'solid-js';
import {SetStoreFunction} from 'solid-js/store';
import {Transition} from 'solid-transition-group';

import {i18n, join} from '../../../../../lib/langPack';

import {useSuperTab} from '../../../../solidJsTabs/superTabProvider';
import Section from '../../../../section';
import Row from '../../../../rowTsx';

import useStarsCommissionAndWithdrawalPrice from './useStarsCommissionAndWithdrawalPrice';
import {MessagesTabStateStore, TRANSITION_TIME} from './config';
import {ChosenPeersByType} from './useStateStore';
import StarRangeInput from './starsRangeInput';


const PaidSettingsSection: Component<{
  store: MessagesTabStateStore;
  setStore: SetStoreFunction<MessagesTabStateStore>;
  chosenPeersByType: ChosenPeersByType;
  isPaid: boolean;
  exitAnimationPromise: Promise<any>;
}> = (props) => {
  const [tab, {AppAddMembersTab}] = useSuperTab();

  const {commissionPercents, willReceiveDollars} = useStarsCommissionAndWithdrawalPrice(() => props.store.stars);

  const onExceptionsClick = () => {
    tab.slider.createTab(AppAddMembersTab).open({
      type: 'privacy',
      skippable: true,
      title: 'PaidMessages.RemoveFee',
      placeholder: 'PrivacyModal.Search.Placeholder',
      takeOut: (newPeerIds) => {
        props.setStore('chosenPeers', newPeerIds);
      },
      selectedPeerIds: [...props.store.chosenPeers]
    });
  };


  const chosenPeersLabel = () => {
    if(!props.store.chosenPeers.length) return i18n('PrivacySettingsController.AddUsers');

    const {users, chats} = props.chosenPeersByType;

    return join([
      users.length ? i18n('Users', [users.length]) : null,
      chats.length ? i18n('Chats', [chats.length]) : null
    ].filter(Boolean), false);
  };

  return (
    <Transition
      onEnter={async(_el, done) => {
        const el = _el as HTMLElement;
        el.style.opacity = '0';
        await props.exitAnimationPromise;
        await el.animate({opacity: [0, 1]}, {duration: TRANSITION_TIME}).finished;
        el.style.removeProperty('opacity');
        done();
      }}
      onExit={async(el, done) => {
        await el.animate({opacity: [1, 0]}, {duration: TRANSITION_TIME}).finished;
        done();
      }}
    >
      <Show when={props.isPaid}>
        <div>
          <Section
            name="PaidMessages.SetPrice"
            caption="PaidMessages.SetPriceDescription"
            captionArgs={[
              commissionPercents(),
              willReceiveDollars()
            ]}
          >
            <StarRangeInput value={props.store.stars} onChange={props.setStore.bind(null, 'stars')} />
          </Section>

          <Section name="PrivacyExceptions" caption="PaidMessages.RemoveFeeDescription">
            <Row clickable={onExceptionsClick}>
              <Row.Title>{i18n('PaidMessages.RemoveFee')}</Row.Title>
              <Row.RightContent><span class="primary">{chosenPeersLabel()}</span></Row.RightContent>
            </Row>
          </Section>
        </div>
      </Show>
    </Transition>
  );
};

export default PaidSettingsSection;
