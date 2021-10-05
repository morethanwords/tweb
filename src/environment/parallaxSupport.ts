import { IS_FIREFOX } from "./userAgent";

const PARALLAX_SUPPORTED = !IS_FIREFOX && false;

export default PARALLAX_SUPPORTED;