import type {BoundManagers, TabManagers as TabManagersType} from '@lib/getProxiedManagers';
import type {AppManager} from '@appManagers/manager';

export type AppManagers = BoundManagers;
export type TabManagers = TabManagersType;

/** What only reads - a picture, a title, a list - may take either kind. */
export type ReadingManagers = AppManagers | TabManagers;
