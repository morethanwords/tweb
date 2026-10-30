import {createMemo, createSignal, JSX, Show, Signal} from 'solid-js';
import InlineSelect from '@components/sidebarLeft/tabs/passcodeLock/inlineSelect';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {DurationType} from '@helpers/formatDuration';
import createOptimisticSave from '@helpers/createOptimisticSave';
import {LangPackKey} from '@lib/langPack';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

export type InactivityPeriodOption = {value: number, label: () => JSX.Element};

const makeOptions = (periods: {days: number, duration: number, type: DurationType}[]): InactivityPeriodOption[] => {
  return periods.map(({days, duration, type}) => ({
    value: days,
    label: () => wrapFormattedDuration([{duration, type}])
  }));
};

/** The periods tdesktop offers for `account.setAuthorizationTTL`, in days. */
export const SESSION_TTL_OPTIONS = makeOptions([
  {days: 7, duration: 1, type: DurationType.Weeks},
  {days: 30, duration: 1, type: DurationType.Months},
  {days: 90, duration: 3, type: DurationType.Months},
  {days: 180, duration: 6, type: DurationType.Months},
  {days: 365, duration: 1, type: DurationType.Years}
]);

/** The periods tdesktop's `SelfDestructionBox` offers for `account.setAccountTTL`, every one of them in months. */
export const ACCOUNT_TTL_OPTIONS = makeOptions([
  {days: 30, duration: 1, type: DurationType.Months},
  {days: 90, duration: 3, type: DurationType.Months},
  {days: 180, duration: 6, type: DurationType.Months},
  {days: 365, duration: 12, type: DurationType.Months},
  {days: 548, duration: 18, type: DurationType.Months},
  {days: 720, duration: 24, type: DurationType.Months}
]);

/** A server is free to hold a period the list doesn't offer (183 days, or the 730 Android sets). */
export const nearestInactivityPeriod = (options: InactivityPeriodOption[], days: number) => {
  return options.reduce((nearest, option) => {
    return Math.abs(days - option.value) < Math.abs(days - nearest.value) ? option : nearest;
  }, options[0]).value;
};

/**
 * How long the user may stay away before the server acts — terminates a session (Active Sessions),
 * deletes the account (Privacy and Security). A new period shows at once; refused, the row shows what the
 * server holds then, with a toast. While `days` is 0 the period is not known, and the row offers nothing.
 */
export default function InactivityPeriodRow(props: {
  title: LangPackKey,
  options: InactivityPeriodOption[],
  days: Signal<number>,
  /** The manager's save, which sends the periods in the order it is given them, whichever screen gave them */
  save: (days: number) => Promise<unknown>,
  /** The manager's period, asked after the periods on their way: what a refusal leaves on the server */
  reload: () => Promise<number>
}) {
  const {Row, i18n, toastNew} = useHotReloadGuard();
  const [rowEl, setRowEl] = createSignal<HTMLElement>();
  const [isOpen, setIsOpen] = createSignal(false);
  const selected = createMemo(() => {
    const days = props.days[0]();
    return days ? nearestInactivityPeriod(props.options, days) : undefined;
  });

  // * picked again before the server answered: the manager sends the periods in turn, a refusal puts back
  // * what the server holds — not known (0) when it cannot say either
  const enqueueSave = createOptimisticSave((days: number) => props.save(days), (days) => {
    props.days[1](days || 0);
    toastNew({langPackKey: 'Error.AnError'});
  }, () => props.reload());

  const save = (days: number) => {
    const [getDays, setDays] = props.days;
    const previous = getDays();
    setDays(days);
    enqueueSave(days, previous);
  };

  return (
    <Row ref={setRowEl} clickable={() => setIsOpen(!!selected())} aria-disabled={!selected()}>
      <Row.Title>{i18n(props.title)}</Row.Title>
      <Row.RightContent>
        <Show when={selected()}>
          <InlineSelect
            value={selected()}
            isOpen={isOpen()}
            onClose={() => setIsOpen(false)}
            options={props.options}
            onChange={(days: number) => {
              setIsOpen(false);
              if(days !== selected()) save(days);
            }}
            parent={rowEl()}
          />
        </Show>
      </Row.RightContent>
    </Row>
  );
}
