import {IS_FIREFOX} from '@environment/userAgent';

const IS_PARALLAX_SUPPORTED = !IS_FIREFOX && false;

export default IS_PARALLAX_SUPPORTED;
