import {Component, ComponentProps, createComputed, createEffect, createSignal, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {Transition} from 'solid-transition-group';

import type SolidJSHotReloadGuardProvider from '../../../../lib/solidjs/hotReloadGuardProvider';
import {i18n} from '../../../../lib/langPack';

import useStarsCommissionAndWithdrawalPrice from '../../../sidebarLeft/tabs/privacy/messages/useStarsCommissionAndWithdrawalPrice';
import {PromiseCollector} from '../../../sidebarLeft/tabs/solidJsTabs/promiseCollector';
import StarRangeInput from '../../../sidebarLeft/tabs/privacy/messages/starsRangeInput';
import StaticSwitch from '../../../staticSwitch';
import Section from '../../../section';
import RowTsx from '../../../rowTsx';


const TRANSITION_PARAMS: KeyframeAnimationOptions = {duration: 200, easing: 'ease-out'};

const ChargeForMessasgesSection: Component<{
  initialStars: number;
  onStarsChange: (amount: number) => void;
}> = (props) => {
  const [checked, setChecked] = createSignal(!!props.initialStars);
  const [stars, setStars] = createSignal(props.initialStars || 0);

  const {commissionPercents, willReceiveDollars} = useStarsCommissionAndWithdrawalPrice(stars);

  createComputed(() => {
    if(checked()) {
      setStars(prev => prev || props.initialStars || 1);
    } else {
      setStars(0);
    }
  });

  let first = true;
  createEffect(() => {
    if(first) {
      first = false;
      stars();
      return;
    }

    props.onStarsChange(stars());
  });

  return (
    <>
      <Section caption='PaidMessages.ChargeForGroupMessagesDescription'>
        <RowTsx
          rightContent={
            <StaticSwitch checked={checked()} />
          }
          clickable={() => {setChecked(p => !p)}}
          title={i18n('PaidMessages.ChargeForMessages')}
        />
      </Section>
      <Transition
        onEnter={async(el, done) => {
          const height = el.scrollHeight;
          await el.animate({height: ['0px', height + 'px']}, TRANSITION_PARAMS).finished;

          done();
        }}
        onExit={async(el, done) => {
          const height = el.clientHeight;
          await el.animate({
            height: [height + 'px', '0px'],
            opacity: [1, 0]
          }, TRANSITION_PARAMS).finished;

          done();
        }}
      >
        <Show when={checked()}>
          <Section
            name='PaidMessages.SetPrice'
            class='overflow-hidden'
            caption='PaidMessages.SetPriceGroupDescription'
            captionArgs={[
              commissionPercents(),
              willReceiveDollars()
            ]}
          >
            <StarRangeInput value={stars()} onChange={setStars} />
          </Section>
        </Show>
      </Transition>
    </>
  );
};

const createChargeForMessasgesSection = (
  props: ComponentProps<typeof ChargeForMessasgesSection>,
  HotReloadProvider: typeof SolidJSHotReloadGuardProvider
) => {
  const element = document.createElement('div');

  const promiseCollectorHelper = PromiseCollector.createHelper();

  const dispose = render(() => (
    <HotReloadProvider>
      <PromiseCollector onCollect={promiseCollectorHelper.onCollect}>
        <ChargeForMessasgesSection {...props} />
      </PromiseCollector>
    </HotReloadProvider>
  ), element);

  return {
    element,
    dispose,
    promise: promiseCollectorHelper.await()
  }
};

export default createChargeForMessasgesSection;
