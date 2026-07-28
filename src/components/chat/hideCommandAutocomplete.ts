import type AutocompleteHelperController from '@components/chat/autocompleteHelperController';

export default function hideCommandAutocomplete(
  controller: AutocompleteHelperController
) {
  controller.hideOtherHelpers(undefined, true);
}
