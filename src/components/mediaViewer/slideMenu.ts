/**
 * A menu of the media viewer belongs to the slide it was opened on (`slide()`: the viewer's slide generation and
 * target). An open the slide outlives — paging while the menu filters its items or waits for frames — is dropped
 * (`canOpen`), and what an action only a menu has acts on is the slide the shown menu was built for, while that one
 * is still shown (`target`): a menu shown again as it closes keeps the items of the slide it was built on.
 */
export default function createSlideMenu<T>(slide: () => {id: number, target: T}) {
  let builtFor: T;
  return {
    /** For a `ButtonMenuToggle` of the viewer */
    toggle() {
      let opening: {id: number, target: T};
      return {
        onOpenBefore: () => {
          opening = slide();
        },
        onOpen: () => {
          builtFor = opening.target;
        },
        canOpen: () => opening.id === slide().id
      };
    },
    target() {
      const {target} = slide();
      return builtFor === target ? target : undefined;
    }
  };
}
