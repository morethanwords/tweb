import {MessagesBotResults} from '../../../../layer';

export default function generateQId(queryId: MessagesBotResults.messagesBotResults['query_id'], resultId: string) {
  return queryId + '_' + resultId;
}
