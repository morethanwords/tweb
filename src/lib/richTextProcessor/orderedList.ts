const ORDERED_LIST_TYPES: Record<string, {htmlType: string, style: string}> = {
  '1': {htmlType: '1', style: 'decimal'},
  'decimal': {htmlType: '1', style: 'decimal'},
  'a': {htmlType: 'a', style: 'lower-alpha'},
  'lower-alpha': {htmlType: 'a', style: 'lower-alpha'},
  'lower-latin': {htmlType: 'a', style: 'lower-alpha'},
  'A': {htmlType: 'A', style: 'upper-alpha'},
  'upper-alpha': {htmlType: 'A', style: 'upper-alpha'},
  'upper-latin': {htmlType: 'A', style: 'upper-alpha'},
  'i': {htmlType: 'i', style: 'lower-roman'},
  'lower-roman': {htmlType: 'i', style: 'lower-roman'},
  'I': {htmlType: 'I', style: 'upper-roman'},
  'upper-roman': {htmlType: 'I', style: 'upper-roman'}
};

export function getOrderedListTypePresentation(value: unknown) {
  const type = typeof(value) === 'string' ? value : '';
  const key = type.length > 1 ? type.toLowerCase() : type;
  return Object.prototype.hasOwnProperty.call(ORDERED_LIST_TYPES, key) ? ORDERED_LIST_TYPES[key] : undefined;
}

export function canonicalOrderedListType(value: unknown) {
  const type = typeof(value) === 'string' ? value : '';
  return getOrderedListTypePresentation(type)?.htmlType || type || '1';
}

export function isDecimalOrderedListType(value: unknown) {
  return canonicalOrderedListType(value) === '1';
}

/** The textual equivalent of the CSS counter style, including its decimal fallback. */
export function formatOrderedListMarker(value: number, type?: unknown) {
  const htmlType = getOrderedListTypePresentation(type)?.htmlType;
  if(!Number.isInteger(value) || value < 1 || !htmlType || htmlType === '1') return String(value);
  let marker = '';
  if(htmlType === 'a' || htmlType === 'A') {
    for(let remaining = value; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
      marker = String.fromCharCode(65 + (remaining - 1) % 26) + marker;
    }
  } else {
    if(value > 3999) return String(value);
    const numerals: Array<[number, string]> = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let remaining = value;
    for(const [number, text] of numerals) {
      while(remaining >= number) {
        marker += text;
        remaining -= number;
      }
    }
  }
  return htmlType === htmlType.toLowerCase() ? marker.toLowerCase() : marker;
}
