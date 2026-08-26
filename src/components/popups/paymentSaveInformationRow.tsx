import {LangPackKey, i18n} from '@lib/langPack';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RowTsx from '@components/rowTsx';

export default function PaymentSaveInformationRow(props: {
  checked: boolean,
  disabled?: boolean,
  title: LangPackKey,
  subtitle: LangPackKey,
  onChange: (checked: boolean) => void
}) {
  return (
    <RowTsx disabled={props.disabled}>
      <RowTsx.Title>{i18n(props.title)}</RowTsx.Title>
      <RowTsx.Subtitle>{i18n(props.subtitle)}</RowTsx.Subtitle>
      <RowTsx.CheckboxField>
        <CheckboxFieldTsx
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onChange}
        />
      </RowTsx.CheckboxField>
    </RowTsx>
  );
}
