import {Component} from 'solid-js';
import {SetStoreFunction} from 'solid-js/store';
import {Transition} from 'solid-transition-group';

import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import anchorCallback from '../../../../../helpers/dom/anchorCallback';
import {i18n} from '../../../../../lib/langPack';

import {hideToast, toastNew} from '../../../../toast';
import StaticRadio from '../../../../staticRadio';
import Section from '../../../../section';
import RowTsx from '../../../../rowTsx';

import {MessagesPrivacyOption, MessagesTabStateStore, TRANSITION_TIME} from './config';
import useIsPremium from './useIsPremium';


const DEFAULT_STARS_AMOUNT = 10;

const OptionsSection: Component<{
  store: MessagesTabStateStore;
  setStore: SetStoreFunction<MessagesTabStateStore>;
  isPaid: boolean;
  onExitAnimationPromise: (promise: Promise<any>) => void;
}> = (props) => {
  const {PopupPremium} = useHotReloadGuard();

  const isPremium = useIsPremium();


  const handlePremiumOptionClick = (callback: () => void) => () => {
    if(isPremium()) return callback();

    toastNew({
      langPackKey: 'PrivacySettings.Messages.PremiumError',
      langPackArguments: [
        anchorCallback(() => {
          hideToast();
          PopupPremium.show({
            feature: 'message_privacy'
          });
        })
      ]
    });
  };

  const caption = (
    <Transition
      mode="outin"
      onEnter={async(el, done) => {
        await el.animate({opacity: [0, 1]}, {duration: TRANSITION_TIME}).finished;
        done();
      }}
      onExit={async(el, done) => {
        const promise = el.animate({opacity: [1, 0]}, {duration: TRANSITION_TIME}).finished;
        props.onExitAnimationPromise(promise);
        await promise;
        done();
      }}
    >
      {
        !props.isPaid ?
          i18n('Privacy.MessagesInfo', [anchorCallback(() => void PopupPremium.show())]) :
          i18n('PaidMessages.ChargeForMessagesDescription')
      }
    </Transition>
  );

  return (
    <Section
      name="PrivacyMessagesTitle"
      caption={caption as any}
    >
      <RowTsx
        checkboxField={
          <StaticRadio
            floating
            checked={props.store.option === MessagesPrivacyOption.Everybody}
          />
        }
        clickable={() => {
          props.setStore('option', MessagesPrivacyOption.Everybody);
        }}
        title={i18n('PrivacySettingsController.Everbody')}
      />
      <RowTsx
        checkboxField={
          isPremium() && <StaticRadio
            floating
            checked={props.store.option === MessagesPrivacyOption.ContactsAndPremium}
          />
        }
        icon={!isPremium() ? 'premium_lock' : undefined}
        clickable={handlePremiumOptionClick(() => {
          props.setStore('option', MessagesPrivacyOption.ContactsAndPremium);
        })}
        title={i18n('Privacy.ContactsAndPremium')}
      />
      <RowTsx
        checkboxField={
          isPremium() && <StaticRadio floating checked={props.isPaid} />
        }
        icon={!isPremium() ? 'premium_lock' : undefined}
        clickable={handlePremiumOptionClick(() => {
          props.setStore(prev => ({
            option: MessagesPrivacyOption.Paid,
            stars: prev.stars || DEFAULT_STARS_AMOUNT
          }));
        })}
        title={i18n('PaidMessages.ChargeForMessages')}
      />
    </Section>
  );
};

export default OptionsSection;
