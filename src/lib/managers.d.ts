import type getProxiedManagers from './getProxiedManagers';
import type {AppManager} from './appManagers/manager';

export type AppManagers = ReturnType<typeof getProxiedManagers>;
