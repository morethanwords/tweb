/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Single source of truth for column widths. JS owns every width-related CSS
 * variable; SCSS only reads them.
 *
 *   --default-column-width        min(vw, DEFAULT_COLUMN_WIDTH) — the standard
 *                                  sidebar size; used as the fallback when
 *                                  no user preference is set.
 *   --left-column-visual-width    the rendered width of #column-left,
 *                                  computed from: viewport, user preference,
 *                                  open-tabs state.
 *   --left-column-width           the width #column-left occupies in layout
 *                                  flow (what neighbors — chat translateX —
 *                                  should respect). Differs from
 *                                  --left-column-visual-width while the
 *                                  sidebar is collapsed-with-tabs-open: the
 *                                  sidebar visually grows to default but
 *                                  layout still reserves only 80 (overlays
 *                                  the chat).
 *   --right-column-width          right column rendered width (user
 *                                  preference, clamped to MIN/MAX); full vw
 *                                  on handhelds.
 *   --middle-column-width         column-center's layout width (vw - 2 × outer
 *                                  padding).
 *   --middle-column-width-value   numeric copy used by SCSS calc().
 *
 * Toggles `body.right-column-floats` when the right column overlays the chat
 * (viewport too narrow to fit left + chat + right + paddings side-by-side).
 *
 * Mirrors SCSS constants — keep these in sync with src/scss/variables.scss.
 */

import mediaSizes from '@helpers/mediaSizes';
import rootScope from '@lib/rootScope';
import clamp from '@helpers/number/clamp';
import throttle from '@helpers/schedulers/throttle';

// Default and resize range for the left & right columns.
export const DEFAULT_COLUMN_WIDTH = 360;
export const MIN_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 480;
export const SIDEBAR_COLLAPSE_FACTOR = 0.65;
// Width of #column-left when collapsed. Matches --sidebar-collapsed-width in
// scss/partials/_leftSidebar.scss.
export const SIDEBAR_COLLAPSED_WIDTH = 80;
// Folders sidebar geometry. Owned by JS — written to `--folders-sidebar-width`
// and `--folders-sidebar-offset` so SCSS only consumes the vars.
const FOLDERS_SIDEBAR_WIDTH = 72;
const FOLDERS_SIDEBAR_GAP = 8;
const FOLDERS_SIDEBAR_OFFSET = FOLDERS_SIDEBAR_WIDTH + FOLDERS_SIDEBAR_GAP;

// $page-chats-padding: 1rem (16px on the default 16px root font size).
const PAGE_CHATS_PADDING = 16;
// $messages-container-width — minimum horizontal slot the chat content
// expects between the columns before the right column starts to float.
const MESSAGES_CONTAINER_WIDTH = 728;

const STORAGE_KEY_LEFT = 'sidebar-left-width';
const STORAGE_KEY_RIGHT = 'sidebar-right-width';

// User-preferred widths for the docked sidebars. Persisted in localStorage.
// `undefined` means "no preference, use DEFAULT_COLUMN_WIDTH". For the left
// column 0 also means "collapsed".
let userPreferredLeftWidth: number | undefined;
let userPreferredLeftCollapsed = false;
let userPreferredRightWidth: number | undefined;

// Transient state: when sidebar is collapsed but a tab is open (Settings
// etc.), it pops out to the full width while the tab remains visible. The
// transition is owned by CSS (transition on width when .is-collapsed),
// so JS only flips the steady-state flag.
let openTabsLeftSidebar = false;

// Whether the folders sidebar is actually visible (preference enabled AND
// viewport wide enough). Mirrors `body.has-folders-sidebar`; pushed in by
// stores/foldersSidebar.ts when the class is toggled.
let foldersSidebarShown = false;

(function loadUserPreferences() {
  const rawLeft = localStorage.getItem(STORAGE_KEY_LEFT);
  if(rawLeft != null) {
    const n = parseInt(rawLeft);
    if(!isNaN(n)) {
      if(n === 0) userPreferredLeftCollapsed = true;
      else userPreferredLeftWidth = clamp(n, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
    }
  }
  const rawRight = localStorage.getItem(STORAGE_KEY_RIGHT);
  if(rawRight != null) {
    const n = parseInt(rawRight);
    if(!isNaN(n)) userPreferredRightWidth = clamp(n, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
  }
})();

const persistLeftPreference = throttle(() => {
  localStorage.setItem(
    STORAGE_KEY_LEFT,
    (userPreferredLeftCollapsed ? 0 : userPreferredLeftWidth) + ''
  );
}, 200);

const persistRightPreference = throttle(() => {
  localStorage.setItem(STORAGE_KEY_RIGHT, userPreferredRightWidth + '');
}, 200);

/**
 * Called by the left resize handle while the user drags. `width <= 0`
 * records a collapsed preference; any other value is clamped to MIN/MAX
 * before storing.
 */
export function setUserPreferredLeft(width: number): void {
  if(width <= 0) {
    userPreferredLeftCollapsed = true;
    userPreferredLeftWidth = undefined;
  } else {
    userPreferredLeftCollapsed = false;
    userPreferredLeftWidth = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
  }
  persistLeftPreference();
  updateColumnWidths();
}

/**
 * Called by the right resize handle while the user drags. The width is
 * clamped to MIN/MAX — the right column has no collapsed state.
 */
export function setUserPreferredRight(width: number): void {
  userPreferredRightWidth = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
  persistRightPreference();
  updateColumnWidths();
}

export function isUserCollapsedLeft(): boolean {
  return userPreferredLeftCollapsed;
}

/**
 * Toggle the "open tabs" override. When the sidebar is collapsed and a tab
 * (settings, archive, etc.) opens, the rendered width should be
 * DEFAULT_COLUMN_WIDTH instead of SIDEBAR_COLLAPSED_WIDTH. The actual width
 * change is animated by CSS (transition on #column-left.is-collapsed width).
 */
export function setOpenTabsLeftSidebar(value: boolean): void {
  if(openTabsLeftSidebar === value) return;
  openTabsLeftSidebar = value;
  updateColumnWidths();
}

/**
 * Mirror the folders sidebar visibility into the width math. Adds
 * FOLDERS_SIDEBAR_OFFSET to the docked-layout threshold so the right column
 * starts to float a bit sooner when the folders panel reserves space.
 */
export function setFoldersSidebarShown(value: boolean): void {
  if(foldersSidebarShown === value) return;
  foldersSidebarShown = value;
  updateColumnWidths();
}

function computeVisualLeftWidth(): number {
  const vw = window.innerWidth;
  const isMobile = mediaSizes.isMobile;
  const isFloatingLeft = mediaSizes.isLessThanFloatingLeftSidebar && !isMobile;
  const defaultColumnWidth = Math.min(vw, DEFAULT_COLUMN_WIDTH);

  // mobile — SCSS handhelds rule fills the parent grid cell regardless
  // (width: auto; max-width: none). The variable is still consistent.
  if(isMobile) return vw;
  // 601-925px — drawer over the chat, fixed at default.
  if(isFloatingLeft) return defaultColumnWidth;
  // Collapsed AND no tabs open → narrow strip. Tabs-open swaps this to the
  // full width; the CSS transition on .is-collapsed animates the change.
  if(userPreferredLeftCollapsed && !openTabsLeftSidebar) return SIDEBAR_COLLAPSED_WIDTH;
  // Steady state: user preference, or default if none.
  return userPreferredLeftWidth ?? defaultColumnWidth;
}

// Width the left column reserves in the layout flow. Equals the visual width
// in most states, but when the sidebar is collapsed and pops out for open
// tabs, it stays at the collapsed width — the expanded sidebar overlays the
// chat instead of pushing it.
function computeLayoutLeftWidth(): number {
  const vw = window.innerWidth;
  const isMobile = mediaSizes.isMobile;
  const isFloatingLeft = mediaSizes.isLessThanFloatingLeftSidebar && !isMobile;
  const defaultColumnWidth = Math.min(vw, DEFAULT_COLUMN_WIDTH);

  if(isMobile) return vw;
  if(isFloatingLeft) return defaultColumnWidth;
  if(userPreferredLeftCollapsed) return SIDEBAR_COLLAPSED_WIDTH;
  return userPreferredLeftWidth ?? defaultColumnWidth;
}

function computeRightWidth(): number {
  const vw = window.innerWidth;
  if(mediaSizes.isMobile) return vw;
  return userPreferredRightWidth ?? Math.min(vw, DEFAULT_COLUMN_WIDTH);
}

const last = {
  visual: -1,
  layout: -1,
  right: -1,
  middle: -1,
  defaultColumn: -1,
  foldersWidth: -1,
  foldersOffset: -1,
  floats: undefined as boolean | undefined
};
let installed = false;

export default function updateColumnWidths(): void {
  const root = document.documentElement;
  const vw = window.innerWidth;
  const isMobile = mediaSizes.isMobile;

  const defaultColumnWidth = Math.min(vw, DEFAULT_COLUMN_WIDTH);
  const visualLeftWidth = computeVisualLeftWidth();
  const layoutLeftWidth = computeLayoutLeftWidth();
  const rightWidth = computeRightWidth();
  // Whether the right column can dock without overlapping the chat. The
  // threshold is the sum of every horizontal piece currently in the docked
  // layout, so resizing either column (or collapsing the left, or toggling
  // the folders panel) immediately re-evaluates the floats decision.
  const foldersOffset = foldersSidebarShown ? FOLDERS_SIDEBAR_OFFSET : 0;
  const rightColumnFits = foldersOffset + layoutLeftWidth + rightWidth + MESSAGES_CONTAINER_WIDTH + PAGE_CHATS_PADDING * 4;
  const floats = !isMobile && vw < rightColumnFits;
  const middleWidth = isMobile ? vw : vw - PAGE_CHATS_PADDING * 2;

  if(last.defaultColumn !== defaultColumnWidth) {
    root.style.setProperty('--default-column-width', defaultColumnWidth + 'px');
    last.defaultColumn = defaultColumnWidth;
  }
  if(last.visual !== visualLeftWidth) {
    root.style.setProperty('--left-column-visual-width', visualLeftWidth + 'px');
    last.visual = visualLeftWidth;
  }
  if(last.layout !== layoutLeftWidth) {
    root.style.setProperty('--left-column-width', layoutLeftWidth + 'px');
    last.layout = layoutLeftWidth;
  }
  if(last.right !== rightWidth) {
    root.style.setProperty('--right-column-width', rightWidth + 'px');
    last.right = rightWidth;
  }
  if(last.middle !== middleWidth) {
    root.style.setProperty('--middle-column-width', middleWidth + 'px');
    root.style.setProperty('--middle-column-width-value', '' + middleWidth);
    last.middle = middleWidth;
  }
  if(last.foldersWidth !== FOLDERS_SIDEBAR_WIDTH) {
    root.style.setProperty('--folders-sidebar-width', FOLDERS_SIDEBAR_WIDTH + 'px');
    last.foldersWidth = FOLDERS_SIDEBAR_WIDTH;
  }
  if(last.foldersOffset !== foldersOffset) {
    root.style.setProperty('--folders-sidebar-offset', foldersOffset + 'px');
    last.foldersOffset = foldersOffset;
  }
  if(last.floats !== floats) {
    document.body.classList.toggle('right-column-floats', floats);
    last.floats = floats;
  }
}

export function installColumnWidthsUpdater(): void {
  if(installed) return;
  installed = true;
  mediaSizes.addEventListener('resize', updateColumnWidths);
  rootScope.addEventListener('resizing_left_sidebar', updateColumnWidths);
  updateColumnWidths();
}

// Initial paint — set CSS vars as early as the module is imported so the
// sidebars render at the correct width before installColumnWidthsUpdater()
// runs. Subsequent resizes are driven by the mediaSizes listener installed
// in installColumnWidthsUpdater().
updateColumnWidths();
