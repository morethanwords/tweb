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

export type ComposeMessageWithAiResult = {
  resultText: TextWithEntities;
  diffText?: TextWithEntities;
};

export type CreateToneArgs = {
  displayAuthor?: boolean;
  emojiId: string | number;
  title: string;
  prompt: string;
};

export type EditToneArgs = Partial<CreateToneArgs> & {
  toneId: number | string;
};

export class AiTonesManager extends AppManager {
  private tones: Tone[] = [];
  /**
   * Maps tone name (if it's a default tone) or tone id to the tone object.
   */
  private tonesMap = new Map<string, Tone>();
  private tonesHash: number | string = 0;
  private isStale = true;

  private fetchingTonesPromise: Promise<Tone[]>;

  constructor() {
    super();
    this.name = 'AiTonesManager';
  }

  public clear: (init?: boolean) => void = () => {
    this.tonesMap.clear();
    this.tonesHash = 0;
    this.isStale = true;
  };

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateAiComposeTones: () => {
        this.isStale = true;
      }
    });
  }

  getTones(forceFetch = false) {
    if(!this.isStale && !forceFetch && this.tones.length) return this.tones;

    if(this.fetchingTonesPromise) return this.fetchingTonesPromise;

    return this.fetchingTonesPromise = (async() => {
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
    })();
  }

  protected async fetchTones(hash: number | string) {
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

  async createTone({displayAuthor, emojiId, title, prompt}: CreateToneArgs): Promise<Tone> {
    const createdTone = await this.apiManager.invokeApi('aicompose.createTone', {
      display_author: displayAuthor,
      emoji_id: emojiId,
      title,
      prompt
    });

    this.isStale = true;
    this.tones.unshift(createdTone);
    if(createdTone._ === 'aiComposeTone') this.tonesMap.set(createdTone.id.toString(), createdTone);

    return createdTone;
  }

  async editTone({toneId, displayAuthor, emojiId, title, prompt}: EditToneArgs) {
    const tone = this.tonesMap.get(toneId.toString());
    if(tone?._ !== 'aiComposeTone') return;

    const updatedTone = await this.apiManager.invokeApi('aicompose.updateTone', {
      tone: this.getToneInput(tone),
      display_author: displayAuthor,
      emoji_id: emojiId,
      title,
      prompt
    });

    this.isStale = true;
    if(updatedTone._ === 'aiComposeTone') this.tonesMap.set(updatedTone.id.toString(), updatedTone);
    const index = this.tones.findIndex(t => t._ === 'aiComposeTone' && t.id.toString() === toneId.toString());
    if(index !== -1) this.tones[index] = updatedTone;

    return updatedTone;
  }

  async saveToneBySlug(toneSlug: string, unsave: boolean) {
    await this.apiManager.invokeApi('aicompose.saveTone', {
      tone: {
        _: 'inputAiComposeToneSlug',
        slug: toneSlug
      },
      unsave
    });

    this.isStale = true;
  }

  async saveToneById(toneId: string | number, unsave: boolean) {
    const tone = this.tonesMap.get(toneId.toString());
    if(tone?._ !== 'aiComposeTone') return;

    await this.apiManager.invokeApi('aicompose.saveTone', {
      tone: this.getToneInput(tone),
      unsave
    });

    if(unsave) {
      this.tones = this.tones.filter(tone => tone._ !== 'aiComposeTone' || tone.id.toString() !== toneId.toString());
      this.tonesMap.delete(toneId.toString());
    }

    this.isStale = true;
  }

  async deleteTone(toneId: string | number) {
    const tone = this.tonesMap.get(toneId.toString());
    if(tone?._ !== 'aiComposeTone') return;

    await this.apiManager.invokeApi('aicompose.deleteTone', {
      tone: this.getToneInput(tone)
    });

    this.tones = this.tones.filter(tone => tone._ !== 'aiComposeTone' || tone.id.toString() !== toneId.toString());
    this.tonesMap.delete(toneId.toString());

    this.isStale = true;
  }

  async addTone(toneSlug: string) {
    await this.saveToneBySlug(toneSlug, false);
  }

  async removeSavedTone(toneId: string | number) {
    await this.saveToneById(toneId, true);
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
