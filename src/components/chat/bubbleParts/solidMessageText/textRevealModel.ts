import {getCommonGraphemePrefixLength, updateGraphemes} from '@lib/richTextProcessor/graphemes';

export type MessageTextPhase = 'streaming' | 'finalizing' | 'final';

export type TextRevealSnapshot = {
  sourceRevision: number,
  text: string,
  phase: MessageTextPhase,
  reducedMotion?: boolean
};

export type TextRevealGraphemeSnapshot = Omit<TextRevealSnapshot, 'text'> & {
  graphemes: readonly string[]
};

export type TextRevealCountSnapshot = Omit<TextRevealSnapshot, 'text'> & {
  totalGraphemes: number,
  commonPrefixGraphemes: number
};

export type TextRevealState = {
  sourceRevision: number,
  phase: MessageTextPhase,
  visibleGraphemes: number,
  totalGraphemes: number,
  caughtUp: boolean
};

/**
 * State-only streaming reveal model. It deliberately knows nothing about the
 * DOM or scrolling, which lets a bubble-level viewport coordinator own layout
 * anchoring. Incoming revisions are monotonic: a late older revision is
 * ignored, while a rewrite clamps the reveal cursor to the grapheme LCP.
 */
export class TextRevealModel {
  private graphemes: string[] = [];
  private text = '';
  private totalGraphemes = 0;
  private state: TextRevealState = {
    sourceRevision: -1,
    phase: 'final',
    visibleGraphemes: 0,
    totalGraphemes: 0,
    caughtUp: true
  };

  public getState(): TextRevealState {
    return this.state;
  }

  public update(snapshot: TextRevealSnapshot): TextRevealState {
    if(snapshot.sourceRevision < this.state.sourceRevision) return this.state;
    const append = snapshot.text.startsWith(this.text);
    const details = {changedFrom: 0};
    const graphemes = updateGraphemes(this.text, this.graphemes, snapshot.text, append, details);
    this.text = snapshot.text;
    return this.applyGraphemes({
      sourceRevision: snapshot.sourceRevision,
      phase: snapshot.phase,
      reducedMotion: snapshot.reducedMotion,
      graphemes
    }, details.changedFrom);
  }

  /**
   * Updates from an already-segmented sequence. Rich text uses this so
   * graphemes cannot merge across independently rendered leaf boundaries.
   */
  public updateGraphemes(snapshot: TextRevealGraphemeSnapshot): TextRevealState {
    if(snapshot.sourceRevision < this.state.sourceRevision) return this.state;
    this.text = '';
    return this.applyGraphemes(snapshot);
  }

  /** Count-only path for rich leaves that own and distribute their graphemes. */
  public updateCounts(snapshot: TextRevealCountSnapshot): TextRevealState {
    if(snapshot.sourceRevision < this.state.sourceRevision) return this.state;
    this.text = '';
    this.graphemes = [];
    return this.applyState(
      snapshot.sourceRevision,
      snapshot.phase,
      Math.max(0, snapshot.totalGraphemes),
      Math.max(0, snapshot.commonPrefixGraphemes),
      snapshot.reducedMotion
    );
  }

  private applyGraphemes(snapshot: TextRevealGraphemeSnapshot, knownCommonPrefix?: number): TextRevealState {
    if(snapshot.sourceRevision < this.state.sourceRevision) return this.state;

    const graphemes = Array.isArray(snapshot.graphemes) ? snapshot.graphemes as string[] : Array.from(snapshot.graphemes);
    const commonPrefix = knownCommonPrefix ?? getCommonGraphemePrefixLength(this.graphemes, graphemes);
    this.graphemes = graphemes;
    return this.applyState(
      snapshot.sourceRevision,
      snapshot.phase,
      graphemes.length,
      commonPrefix,
      snapshot.reducedMotion
    );
  }

  public advance(count = 1): TextRevealState {
    if(count <= 0 || this.state.caughtUp) return this.state;
    this.state = this.makeState(
      this.state.sourceRevision,
      this.state.phase,
      Math.min(this.state.totalGraphemes, this.state.visibleGraphemes + Math.floor(count))
    );
    return this.state;
  }

  public finish(): TextRevealState {
    if(this.state.caughtUp) return this.state;
    this.state = this.makeState(
      this.state.sourceRevision,
      this.state.phase,
      this.state.totalGraphemes
    );
    return this.state;
  }

  private makeState(sourceRevision: number, phase: MessageTextPhase, visibleGraphemes: number): TextRevealState {
    const totalGraphemes = this.totalGraphemes;
    return {
      sourceRevision,
      phase,
      visibleGraphemes,
      totalGraphemes,
      caughtUp: visibleGraphemes >= totalGraphemes
    };
  }

  private applyState(
    sourceRevision: number,
    phase: MessageTextPhase,
    totalGraphemes: number,
    commonPrefix: number,
    reducedMotion?: boolean
  ) {
    this.totalGraphemes = totalGraphemes;
    const immediate = reducedMotion || phase === 'final';
    const visibleGraphemes = immediate ?
      totalGraphemes :
      Math.min(this.state.visibleGraphemes, commonPrefix);
    this.state = this.makeState(sourceRevision, phase, visibleGraphemes);
    return this.state;
  }
}
