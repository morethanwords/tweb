import {AiComposeTone, InputAiComposeTone, TextWithEntities} from '@layer';
import {AppManager} from '@lib/appManagers/manager';

type Tone = AiComposeTone;

export type ComposeMessageWithAiArgs = {
  text: TextWithEntities;
  toneNameOrId?: string;
  proofRead?: boolean;
  translateTo?: string;
  emojify?: boolean;
};

export class AiTonesManager extends AppManager {
  private tones: Tone[] = [];
  /**
   * Maps tone name (if it's a default tone) or tone id to the tone object.
   */
  private tonesMap = new Map<string, Tone>();
  private tonesHash: number | string = 0;
  private isStale = true;

  constructor() {
    super();
    this.name = 'AiTonesManager';
  }

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateAiComposeTones: () => {
        this.isStale = true;
      }
    });
  }

  async getTones(forceFetch = false) {
    if(!this.isStale && !forceFetch && this.tones.length) return this.tones;

    const fetchedResult = await this.fetchTones(this.tonesHash);
    if(!fetchedResult) return this.tones; // not modified

    this.tonesHash = fetchedResult.hash;
    this.isStale = false;

    this.tonesMap.clear();
    for(const tone of fetchedResult.tones) {
      if(tone._ === 'aiComposeToneDefault') this.tonesMap.set(tone.tone, tone);
      else if(tone._ === 'aiComposeTone') this.tonesMap.set(tone.id.toString(), tone);
    }

    return this.tones = fetchedResult.tones;
  }

  protected async fetchTones(hash: number | string) {
    // TODO: handle multiple requests at once
    const result = await this.apiManager.invokeApi('aicompose.getTones', {hash});
    if(result._ === 'aicompose.tonesNotModified') return;

    this.appUsersManager.saveApiUsers(result.users);

    return {
      tones: result.tones,
      hash: result.hash
    };
  }

  private getToneInput(tone: Tone | undefined): InputAiComposeTone | undefined {
    if(tone._ === 'aiComposeToneDefault') return {_: 'inputAiComposeToneDefault', tone: tone.tone};
    if(tone._ === 'aiComposeTone') return {_: 'inputAiComposeToneID', id: tone.id, access_hash: tone.access_hash};
    return undefined;
  }

  async composeMessageWithAi({text, toneNameOrId, proofRead, translateTo, emojify}: ComposeMessageWithAiArgs) {
    const tone = toneNameOrId ? this.tonesMap.get(toneNameOrId) : undefined;

    const result = await this.apiManager.invokeApi('messages.composeMessageWithAI', {
      text,
      emojify,
      translate_to_lang: translateTo,
      tone: tone ? this.getToneInput(tone) : undefined,
      proofread: proofRead
    });

    return {
      resultText: result.result_text,
      diffText: result.diff_text
    };
  }
}
