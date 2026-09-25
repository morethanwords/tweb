import type {RichText} from '@layer';

export default function hasRichTextContent(text?: RichText): boolean {
  if(!text) return false;
  switch(text._) {
    case 'textEmpty':
      return false;
    case 'textPlain':
      return !!text.text.trim();
    case 'textConcat':
      return text.texts.some(hasRichTextContent);
    case 'textMath':
      return !!text.source.trim();
    case 'textCustomEmoji':
      return !!text.document_id || !!text.alt;
    case 'textImage':
      return true;
    case 'textAnchor':
      return !!text.name || hasRichTextContent(text.text);
    case 'textDiff':
      return hasRichTextContent(text.text);
    default:
      return hasRichTextContent(text.text);
  }
}
