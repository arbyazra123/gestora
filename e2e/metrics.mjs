/**
 * Lightweight timing-metrics recorder for the e2e scripts. Captures named
 * milestones (relative ms from script start, plus absolute Date.now() for
 * cross-client comparisons like countdown sync skew) and writes them to
 * e2e/metrics/<scenario>-<game>.json for matrix.mjs to aggregate.
 *
 * This is NOT a substitute for production observability — see the metrics
 * report for what a real deployment should also instrument (server tick
 * health, packet loss, reconciliation divergence, etc). This only measures
 * what's observable from outside the browser/server in a scripted run.
 */
import { writeFileSync, mkdirSync } from 'fs';

export function createRecorder(game, scenarioName) {
  const t0 = Date.now();
  const marks = {};

  return {
    /** Record a milestone, ms elapsed since recorder creation. */
    mark(name) {
      marks[name] = Date.now() - t0;
    },
    /** Record a milestone as an absolute timestamp (for cross-client diffs). */
    markAbsolute(name) {
      marks[name] = Date.now();
    },
    save() {
      mkdirSync('metrics', { recursive: true });
      const path = `metrics/${scenarioName}-${game}.json`;
      writeFileSync(path, JSON.stringify({ game, scenario: scenarioName, capturedAt: t0, marks }, null, 2));
      return path;
    }
  };
}
