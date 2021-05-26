import AutocompleteHelper from "./autocompleteHelper";

export default class AutocompleteHelperController {
  private helpers: Set<AutocompleteHelper> = new Set();

  public addHelpers(helpers: AutocompleteHelper[]) {
    for(const helper of helpers) {
      this.helpers.add(helper);
    }
  }

  public toggleHelper(helper: AutocompleteHelper, hide?: boolean) {
    this.helpers.forEach(h => {
      if(h !== helper) {
        helper.toggle(true);
      }
    });

    helper.toggle(hide);
  }
}
