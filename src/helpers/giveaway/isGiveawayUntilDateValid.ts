// All arguments are UNIX timestamps in SECONDS (matching tsNow(true) and the
// MTProto until_date field). The end date must be strictly in the future and no
// later than now + giveaway_period_max — mirroring tdesktop's ChooseDateTimeBox
// bounds (.min = now, .max = now + giveawayPeriodMax) and its collect() guard.
export default function isGiveawayUntilDateValid(untilDate: number, now: number, periodMax: number) {
  return untilDate > now && untilDate <= now + periodMax;
}
