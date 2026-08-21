import type {Authorization} from '@layer';

/**
 * Platform icon for an active session. The api_id lists identify the official
 * client families (tdesktop's `TypeFromEntry` in `settings_active_sessions.cpp`),
 * and the app / device / platform strings cover everything the lists miss —
 * the same heuristics Web A uses in `getSessionIcon`. tweb has no per-browser
 * glyphs, so every browser collapses onto the web icons.
 */

const ANDROID_API_IDS = new Set([5, 6, 24, 1026, 1083, 2458, 2521, 21724]);
const DESKTOP_API_IDS = new Set([2040, 17349, 611335]);
const MAC_API_IDS = new Set([2834]);
const IOS_API_IDS = new Set([1, 7, 10840, 16352]);
const WEB_API_IDS = new Set([2496, 739222, 1025907]);

const BROWSER_MARKERS = ['edg/', 'edgios/', 'edga/', 'chrome', 'safari', 'firefox'];

/**
 * "Telegram Web K" / "Telegram Web A" — the flavour is the trailing letter. The
 * server splits it off into the version for some sessions ("Telegram Web",
 * "2.2 K"), so this runs over the name and the version joined.
 */
const WEB_CODE_NAME_REGEX = /\b([ak])\b\s*$/;

const detectDesktop = (platform: string): Icon => {
  if(platform.includes('windows')) return 'win_key_filled';
  if(platform.includes('macos')) return 'apple_filled';
  if(platform.includes('ubuntu') || platform.includes('unity')) return 'ubuntu_filled';
  if(platform.includes('linux')) return 'linux_filled';
};

const detectWeb = (app: string): Icon => {
  if(app.includes('webk')) return 'web_k_filled';
  if(app.includes('weba')) return 'web_a_filled';

  const codeName = app.match(WEB_CODE_NAME_REGEX)?.[1];
  if(codeName === 'k') return 'web_k_filled';
  if(codeName === 'a') return 'web_a_filled';

  return 'web_filled';
};

export default function getSessionPlatformIcon(authorization: Authorization.authorization): Icon {
  const device = (authorization.device_model || '').toLowerCase();
  // tdesktop tests `platform` and `system_version` separately, but always for
  // the same markers — one haystack gives the same answer.
  const platform = `${authorization.platform || ''} ${authorization.system_version || ''}`.toLowerCase();
  const app = `${authorization.app_name || ''} ${authorization.app_version || ''}`.toLowerCase();
  const apiId = authorization.api_id;

  if(ANDROID_API_IDS.has(apiId)) return 'android_filled';
  if(DESKTOP_API_IDS.has(apiId)) return detectDesktop(platform) || 'linux_filled';
  if(MAC_API_IDS.has(apiId)) return 'apple_filled';
  if(WEB_API_IDS.has(apiId) || app.includes('web') || platform.includes('web')) return detectWeb(app);
  if(device.includes('chromebook')) return 'devices_filled';
  if(BROWSER_MARKERS.some((marker) => device.includes(marker))) return detectWeb(app);
  if(device.includes('iphone') || device.includes('ipad')) return 'apple_filled';
  if(IOS_API_IDS.has(apiId)) return 'apple_filled';

  const desktop = detectDesktop(platform);
  if(desktop) return desktop;
  if(platform.includes('android')) return 'android_filled';
  if(platform.includes('ios')) return 'apple_filled';

  return 'devices_filled';
}
