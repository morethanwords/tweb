import type {RichText} from '@layer';

// The rich text pieces tests build messages of.

export const plain = (text: string): RichText => ({_: 'textPlain', text});
export const concat = (...texts: RichText[]): RichText => ({_: 'textConcat', texts});
export const emoji = (alt: string): RichText => ({_: 'textCustomEmoji', document_id: 1, alt});
