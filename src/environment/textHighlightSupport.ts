/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// CSS Custom Highlight API (`CSS.highlights` + `::highlight()`): paints arbitrary DOM ranges
// without touching the DOM. Chrome 105+, Safari 17.2+, Firefox 140+. Where it is missing the
// text highlighting (search matches, quotes) is simply not shown.
const IS_TEXT_HIGHLIGHT_SUPPORTED = typeof CSS !== 'undefined' &&
  'highlights' in CSS &&
  typeof Highlight === 'function';

export default IS_TEXT_HIGHLIGHT_SUPPORTED;
