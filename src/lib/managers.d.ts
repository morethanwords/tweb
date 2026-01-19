import type getProxiedManagers from '@lib/getProxiedManagers';
import type {AppManager} from '@appManagers/manager';

export type AppManagers = ReturnType<typeof getProxiedManagers>;
