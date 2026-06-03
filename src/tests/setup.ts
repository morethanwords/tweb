import {installNodeEnv} from './api/nodeEnv';
import {ResizeObserverMock} from './mocks/resizeObserver';

installNodeEnv();

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
