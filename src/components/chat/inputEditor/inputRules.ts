import type {EditorState, PluginSpec, Transaction} from '@tiptap/pm/state';
import {Transform} from '@tiptap/pm/transform';

type InputRuleUndoState = {
  from: number,
  text: string,
  to: number,
  transform: Transform
};

export function preserveInputRuleThroughNormalization(state: EditorState, transaction: Transaction) {
  // Tiptap clears its undoInputRule state on any following document change.
  // Our automatic attribute normalization belongs to the same rewrite: undo
  // its steps together with the rule rather than losing the original marker.
  for(const plugin of state.plugins) {
    if(!(plugin.spec as PluginSpec<InputRuleUndoState> & {isInputRules?: boolean}).isInputRules) continue;
    const previous = plugin.getState(state) as InputRuleUndoState | null;
    if(!previous || !previous.transform.doc.eq(state.doc)) continue;
    const transform = new Transform(previous.transform.before);
    previous.transform.steps.forEach((step) => transform.step(step));
    transaction.steps.forEach((step) => transform.step(step));
    transaction.setMeta(plugin, {...previous, transform});
  }
  return transaction;
}
