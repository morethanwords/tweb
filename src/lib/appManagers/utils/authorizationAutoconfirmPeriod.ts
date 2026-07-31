export const DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD = 7 * 24 * 60 * 60;

export function normalizeAuthorizationAutoconfirmPeriod(period?: number) {
  return period > 0 ? period : DEFAULT_AUTHORIZATION_AUTOCONFIRM_PERIOD;
}
