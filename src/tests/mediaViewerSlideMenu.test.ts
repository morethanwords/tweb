import createSlideMenu from '@components/mediaViewer/slideMenu';

// * the viewer as the menus see it: a slide generation, bumped on every slide, and the slide's target
function makeViewer() {
  const viewer = {
    id: 1,
    target: {mid: 1} as {mid: number},
    page(mid: number) {
      ++viewer.id;
      viewer.target = {mid};
    }
  };
  const slideMenu = createSlideMenu(() => ({id: viewer.id, target: viewer.target}));
  return {viewer, slideMenu};
}

describe('a menu of the media viewer', () => {
  test('acts on the slide it was opened on, while that one is shown', () => {
    const {viewer, slideMenu} = makeViewer();
    const toggle = slideMenu.toggle();
    expect(slideMenu.target()).toBeUndefined();

    toggle.onOpenBefore();
    toggle.onOpen();
    expect(toggle.canOpen()).toBe(true);
    expect(slideMenu.target()).toBe(viewer.target);

    viewer.page(2);
    expect(slideMenu.target()).toBeUndefined();
  });

  test('is dropped when the slide changes while it is still opening', () => {
    const {viewer, slideMenu} = makeViewer();
    const toggle = slideMenu.toggle();
    toggle.onOpenBefore();
    viewer.page(2);
    // * built after the page: its items were chosen for the slide that went
    toggle.onOpen();
    expect(toggle.canOpen()).toBe(false);
    expect(slideMenu.target()).toBeUndefined();
  });

  test('shown again as it closes, keeps the slide it was built on', () => {
    const {viewer, slideMenu} = makeViewer();
    const toggle = slideMenu.toggle();
    toggle.onOpenBefore();
    toggle.onOpen();

    viewer.page(2);
    // * reused as it closes: `ButtonMenuToggle` asks `onOpenBefore` only, the items stay the first slide's
    toggle.onOpenBefore();
    expect(slideMenu.target()).toBeUndefined();
  });

  test('of another toggle, built on the slide shown, acts on it', () => {
    const {viewer, slideMenu} = makeViewer();
    const first = slideMenu.toggle(), second = slideMenu.toggle();
    first.onOpenBefore();
    first.onOpen();
    viewer.page(2);

    second.onOpenBefore();
    second.onOpen();
    expect(second.canOpen()).toBe(true);
    expect(slideMenu.target()).toEqual({mid: 2});
  });
});
