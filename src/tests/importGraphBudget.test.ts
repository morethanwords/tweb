// @vitest-environment node
import {describe, expect, it} from 'vitest';
// @ts-ignore — a plain node script
import {measure, readBudget} from '../../scripts/import-graph.mjs';

/**
 * A ratchet over the import graph (scripts/import-graph.mjs): the largest import cycle — what makes an edit reach
 * a hundred test files — the page modules whose edit reloads the page instead of updating hot, those whose hot
 * update makes a second instance of a singleton or a store, and worker modules mentioning import.meta.hot. None may
 * grow past scripts/import-graph.budget.json; lower the budget with `node scripts/import-graph.mjs check --update`
 * when they shrink.
 */
describe('import graph budget', () => {
  it('stays within the budget', async() => {
    const current: Record<string, number> = await measure();
    const budget: Record<string, number> = readBudget();
    for(const key in budget) {
      expect(current[key], `${key} grew: find what did it with node scripts/import-graph.mjs hmr / why / hazards / cycle`).toBeLessThanOrEqual(budget[key]);
    }
  }, 120_000);
});
