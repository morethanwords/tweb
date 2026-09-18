import type {MyDocument} from '@appManagers/appDocsManager';
import getAudioAttribute from '@appManagers/utils/docs/getAudioAttribute';

/**
 * How a track is named: its audio attribute, with the file name standing in for a missing title
 * (what the profile's playlist row does too). Returns nothing when there is neither — a document
 * that cannot be named is one no caller should render a row or a panel for.
 */
export default function getAudioTitles(doc: MyDocument) {
  const attribute = getAudioAttribute(doc);
  const title = attribute?.title || doc?.file_name;
  const performer = attribute?.performer;
  if(!title && !performer) {
    return;
  }

  return {title, performer};
}
