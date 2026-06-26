/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {BotInfo} from '@layer';
import safeWindowOpen from '@helpers/dom/safeWindowOpen';

// Hardcoded default URL, matching tdesktop (lng_profile_bot_privacy_url) and
// Android (BotDefaultPrivacyPolicy). Not an appConfig key.
export const BOT_DEFAULT_PRIVACY_POLICY_URL = 'https://telegram.org/privacy-tpa';

export function botHasPrivacyCommand(botInfo: BotInfo.botInfo) {
  return botInfo.commands?.some((c) => c.command === 'privacy') ?? false;
}

/**
 * Resolves the bot privacy policy action, mirroring tdesktop/Android:
 * 1) privacy_policy_url set -> open it;
 * 2) else no /privacy command -> open the default URL;
 * 3) else (has /privacy command) -> send /privacy in the bot chat.
 */
export function resolveBotPrivacyPolicy(botInfo: BotInfo.botInfo): {url: string} | {sendCommand: true} {
  if(botInfo.privacy_policy_url) return {url: botInfo.privacy_policy_url};
  if(!botHasPrivacyCommand(botInfo)) return {url: BOT_DEFAULT_PRIVACY_POLICY_URL};
  return {sendCommand: true};
}

/**
 * Acts on the resolved policy: opens the URL in a new tab, or runs
 * sendPrivacyCommand() — the caller's "open the bot chat and send /privacy".
 * Shared by the bot profile row and the mini-app menu item.
 */
export function openBotPrivacyPolicy(botInfo: BotInfo.botInfo, sendPrivacyCommand: () => void) {
  const resolved = resolveBotPrivacyPolicy(botInfo);
  if('url' in resolved) {
    safeWindowOpen(resolved.url);
    return;
  }

  sendPrivacyCommand();
}
