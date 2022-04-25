import documentFragmentToHTML from "../../helpers/dom/documentFragmentToHTML";
import { DraftMessage } from "../../layer";
import mergeEntities from "../../lib/richTextProcessor/mergeEntities";
import parseEntities from "../../lib/richTextProcessor/parseEntities";
import wrapDraftText from "../../lib/richTextProcessor/wrapDraftText";

export default function wrapDraft(draft: DraftMessage.draftMessage) {
  const myEntities = parseEntities(draft.message);
  const apiEntities = draft.entities || [];
  const totalEntities = mergeEntities(apiEntities.slice(), myEntities); // ! only in this order, otherwise bold and emoji formatting won't work

  return documentFragmentToHTML(wrapDraftText(draft.message, {entities: totalEntities}));
}
