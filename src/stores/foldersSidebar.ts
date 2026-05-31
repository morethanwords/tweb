import {createEffect, createMemo, createRoot, createSignal} from 'solid-js';
import {ScreenSize, useMediaSizes} from '@helpers/mediaSizes';
import {setFoldersSidebarShown} from '@helpers/updateColumnWidths';

// RAW user preference (mirrors settings.tabsInSidebar): whether the user has
// the folders sidebar turned ON. Independent of viewport — it stays true even
// when the panel is hidden because the window is too narrow. This is NOT "is
// the panel on screen right now"; for that use useFoldersSidebarShown(), which
// gates this by width. Reach for the RAW value only when you genuinely mean the
// preference (e.g. a setting toggle), not the on-screen state.
const hasFoldersSidebarSignal = createRoot(() => {
  const [hasFoldersSidebar, setHasFoldersSidebar] = createSignal(false);
  return [hasFoldersSidebar, setHasFoldersSidebar] as const;
});

export default function useHasFoldersSidebar() {
  return hasFoldersSidebarSignal;
};

// Derived: whether the folders sidebar is ACTUALLY visible — the RAW preference
// AND a viewport wide enough to fit it (the panel is hidden by SCSS at <=925px).
// This is what UI should key off of when it cares about the on-screen panel.
// Also the single source for the `body.has-folders-sidebar` class and
// updateColumnWidths' reserved-space math, so all three stay in sync.
const foldersSidebarShownSignal = createRoot(() => {
  const [hasFoldersSidebar] = hasFoldersSidebarSignal;
  const mediaSizes = useMediaSizes();
  const shown = createMemo(() => hasFoldersSidebar() && !mediaSizes.isLessThanFloatingLeftSidebar);

  createEffect(() => {
    const visible = shown();
    document.body.classList.toggle('has-folders-sidebar', visible);
    setFoldersSidebarShown(visible);
  });

  return [shown] as const;
});

export function useFoldersSidebarShown() {
  return foldersSidebarShownSignal;
}

const hasFoldersSignal = createRoot(() => {
  const [hasFolders, setHasFolders] = createSignal(false);
  return [hasFolders, setHasFolders] as const;
});

export function useHasFolders() {
  return hasFoldersSignal;
}

const isSidebarCollapsedSignal = createRoot(() => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = createSignal(false);
  return [isSidebarCollapsed, setIsSidebarCollapsed] as const;
});

export function useIsSidebarCollapsed() {
  return isSidebarCollapsedSignal;
}

// Whether something is open inside the left sidebar (a tab — settings,
// archive, etc., search input focused, or a forum). Mirrors the
// `has-open-tabs` class on `#column-left`; pushed in from
// AppSidebarLeft.onSomethingOpenInsideChange so reactive consumers (e.g.
// the collapsed-search-trigger button) can drive their visibility from a
// signal instead of CSS selectors that combine three sidebar classes.
const hasOpenLeftTabsSignal = createRoot(() => {
  const [hasOpenLeftTabs, setHasOpenLeftTabs] = createSignal(false);
  return [hasOpenLeftTabs, setHasOpenLeftTabs] as const;
});

export function useHasOpenLeftTabs() {
  return hasOpenLeftTabsSignal;
}

// Whether the left sidebar's search input is focused / search panel is open.
// Drives the burger element's "back-arrow vs menu icon" state via a Solid
// effect so the class wiring stays in one place — combined with
// useHasFoldersSidebar, which pins the back state on permanently when the
// folders panel provides the main menu trigger.
const isLeftSearchActiveSignal = createRoot(() => {
  const [isLeftSearchActive, setIsLeftSearchActive] = createSignal(false);
  return [isLeftSearchActive, setIsLeftSearchActive] as const;
});

export function useIsLeftSearchActive() {
  return isLeftSearchActiveSignal;
}

createRoot(() => {
  const [hasFolders] = hasFoldersSignal;
  const [foldersSidebarShown] = foldersSidebarShownSignal;
  const [isSidebarCollapsed] = isSidebarCollapsedSignal;
  const mediaSizes = useMediaSizes();
  createEffect(() => {
    const hasFolders$ = hasFolders();
    // Folders render as horizontal tabs unless the vertical panel is actually
    // shown — `!foldersSidebarShown()` is exactly the old
    // `!hasFoldersSidebar() || isLessThanFloatingLeftSidebar`.
    const hasHorizontal = (!isSidebarCollapsed() || mediaSizes.activeScreen < ScreenSize.medium) &&
      !foldersSidebarShown();
    const hasVertical = !hasHorizontal;
    document.body.classList.toggle(
      'has-horizontal-folders',
      hasFolders$ && hasHorizontal
    );
    document.body.classList.toggle(
      'has-vertical-folders',
      hasFolders$ && hasVertical
    );
  });
});
