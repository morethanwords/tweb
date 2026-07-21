import createBirthdaySuggestions from '@components/sidebarLeft/birthdaySuggestions';
import createEmailSetupSuggestion from '@components/sidebarLeft/emailSetupSuggestion';
import createFrozenSuggestion from '@components/sidebarLeft/frozenSuggestion';
import createNotificationsSuggestion from '@components/sidebarLeft/notificationsSuggestion';
import createPasskeySetupSuggestion from '@components/sidebarLeft/passkeySetupSuggestion';
import type {PendingSuggestionController} from '@components/sidebarLeft/pendingSuggestionController';
import styles from '@components/sidebarLeft/pendingSuggestion.module.scss';
import selectPendingSuggestion, {PendingSuggestionType} from '@components/sidebarLeft/selectPendingSuggestion';
import Animated from '@helpers/solid/animations';
import {createEffect, createMemo, createSignal, JSX} from 'solid-js';
import {render} from 'solid-js/web';

export function renderPendingSuggestion(toElement: HTMLElement) {
  toElement.classList.add(styles.container);

  render(() => {
    const birthdaySuggestions = createBirthdaySuggestions();
    const suggestions: Record<PendingSuggestionType, PendingSuggestionController> = {
      frozen: createFrozenSuggestion(),
      notifications: createNotificationsSuggestion(),
      passkey: createPasskeySetupSuggestion(),
      birthdayContacts: birthdaySuggestions.contacts,
      birthdaySetup: birthdaySuggestions.setup
    };
    createEmailSetupSuggestion();

    const [element, setElement] = createSignal<JSX.Element>();
    const suggestionConstructor = createMemo(() => {
      const type = selectPendingSuggestion({
        frozen: suggestions.frozen.available(),
        notifications: suggestions.notifications.available(),
        passkey: suggestions.passkey.available(),
        birthdayContacts: suggestions.birthdayContacts.available(),
        birthdaySetup: suggestions.birthdaySetup.available()
      });

      return type ? suggestions[type].component : undefined;
    });

    createEffect(() => {
      const constructor = suggestionConstructor();
      const element = constructor ? (<div class={styles.suggestionContainer}>{constructor()}</div>) : undefined;
      setElement(element);
    });

    createEffect(() => {
      document.body.classList.toggle('has-pending-suggestion', !!element());
    });

    return (
      <Animated
        type="grow-height"
        appear
        mode="add-remove"
        noItemClass
      >
        {element()}
      </Animated>
    );
  }, toElement);
}
