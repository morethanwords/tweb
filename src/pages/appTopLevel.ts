// The app's top level as one graph: its singletons first, then what @lib/solidjs/hotReloadGuardValue registers of
// them. Static imports run in the order they are written, so the two evaluate one after the other, as two dynamic
// imports awaited in turn would - but a dynamic import of this module fetches both graphs at once, instead of asking
// for the second only when the first has run.
export {default} from '@lib/appDialogsManager';
import '@lib/solidjs/hotReloadGuardValue';
