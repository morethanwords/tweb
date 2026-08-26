import {Component, Show} from 'solid-js';
import {SetStoreFunction} from 'solid-js/store';
import {Transition} from 'solid-transition-group';
import anchorCallback from '@helpers/dom/anchorCallback';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {LangPackKey} from '@lib/langPack';
import RadioFieldTsx from '@components/radioFieldTsx';
import Section from '@components/section';
import {MessagesPrivacyOption, MessagesTabStateStore, TRANSITION_TIME} from '@components/sidebarLeft/tabs/privacy/messages/config';


const DEFAULT_STARS_AMOUNT = 10;

const OptionsSection: Component<{
  store: MessagesTabStateStore;
  setStore: SetStoreFunction<MessagesTabStateStore>;
  isPaid: boolean;
  onExitAnimationPromise: (promise: Promise<any>) => void;
}> = (props) => {
  const {PopupPremium, i18n, toastNew, hideToast, Row, usePremium} = useHotReloadGuard();

  const isPremium = usePremium();


  const handlePremiumOptionClick = (event: MouseEvent) => {
    if(isPremium()) return;

    event.preventDefault();
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

  const OptionRow = (optionProps: {
    checked: boolean,
    langKey: LangPackKey,
    onSelect: () => void,
    premium?: boolean,
    value: MessagesPrivacyOption
  }) => {
    const locked = () => !!optionProps.premium && !isPremium();
    const handleClick = (event: MouseEvent) => {
      if(locked()) {
        handlePremiumOptionClick(event);
      }
    };

    return (
      <Row clickable={handleClick}>
        <Row.RadioField>
          <RadioFieldTsx
            class={locked() ? 'hide' : undefined}
            checked={optionProps.checked}
            name="privacy-messages"
            value={String(optionProps.value)}
            onChange={(checked) => checked && optionProps.onSelect()}
          />
        </Row.RadioField>
        <Show when={locked()}>
          <Row.Icon icon="premium_lock_filled" />
        </Show>
        <Row.Title>{i18n(optionProps.langKey)}</Row.Title>
      </Row>
    );
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
      <OptionRow
        checked={props.store.option === MessagesPrivacyOption.Everybody}
        langKey="PrivacySettingsController.Everbody"
        onSelect={() => {
          props.setStore('option', MessagesPrivacyOption.Everybody);
        }}
        value={MessagesPrivacyOption.Everybody}
      />
      <OptionRow
        checked={props.store.option === MessagesPrivacyOption.ContactsAndPremium}
        langKey="Privacy.ContactsAndPremium"
        onSelect={() => {
          props.setStore('option', MessagesPrivacyOption.ContactsAndPremium);
        }}
        premium
        value={MessagesPrivacyOption.ContactsAndPremium}
      />
      <OptionRow
        checked={props.isPaid}
        langKey="PaidMessages.ChargeForMessages"
        onSelect={() => {
          props.setStore(prev => ({
            option: MessagesPrivacyOption.Paid,
            stars: prev.stars || DEFAULT_STARS_AMOUNT
          }));
        }}
        premium
        value={MessagesPrivacyOption.Paid}
      />
    </Section>
  );
};

export default OptionsSection;
