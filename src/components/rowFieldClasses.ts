/**
 * The classes a `Row` stamps on the fields it lays out itself.
 *
 * A row can also contain a checkbox that is none of its business — the selection checkbox a bubble
 * drops into a document/audio row, say — and that one must not pick up the row's layout. So the
 * styles in `scss/partials/_row.scss` key off these derived classes rather than off `.checkbox-field`
 * / `.radio-field` outright, and only the fields registered through `Row` carry them.
 */
export const ROW_CHECKBOX_FIELD_CLASS = 'row-checkbox-field';
export const ROW_CHECKBOX_FIELD_TOGGLE_CLASS = 'row-checkbox-field-toggle';
export const ROW_RADIO_FIELD_CLASS = 'row-radio-field';
