/**
 * Tests for the pagination rule injected into the agent system prompt
 * (src/features/ai/agent/pagination-rules.ts) and its wiring into
 * getSystemPrompt (src/features/ai/agent/prompts.ts).
 *
 * The wiring check reads prompts.ts as source text instead of importing it:
 * prompts.ts transitively pulls in the extension-host module graph
 * (StateMachine, language client), which must not load in this jest suite.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PAGINATION_LIBRARY_RULE } from '../features/ai/agent/pagination-rules';

describe('PAGINATION_LIBRARY_RULE content', () => {
    test('names the common pagination parameter shapes', () => {
        expect(PAGINATION_LIBRARY_RULE).toMatch(/`page`, `per_page`\/`perPage`, `pageSize`, `limit`\/`offset`, or a cursor\/next-token/);
    });

    test('forbids relying on defaults and mandates the exhaustion loop', () => {
        expect(PAGINATION_LIBRARY_RULE).toMatch(/never rely on a single call or the parameter defaults/);
        expect(PAGINATION_LIBRARY_RULE).toMatch(/stop only when a page comes back short or empty/);
        expect(PAGINATION_LIBRARY_RULE).toMatch(/documented maximum page size/);
    });

    test('is a bullet with no unresolved interpolations or stray backtick escapes', () => {
        expect(PAGINATION_LIBRARY_RULE.startsWith('- ')).toBe(true);
        expect(PAGINATION_LIBRARY_RULE).not.toContain('${');
        expect(PAGINATION_LIBRARY_RULE).not.toContain('\\`');
    });
});

describe('system prompt wiring', () => {
    const promptsSource = fs.readFileSync(
        path.join(__dirname, '../features/ai/agent/prompts.ts'),
        'utf-8',
    );

    test('prompts.ts imports the rule constant', () => {
        const importStatement = promptsSource.match(/import \{[^}]*\} from "\.\/pagination-rules"/);
        expect(importStatement).not.toBeNull();
        expect(importStatement![0]).toContain('PAGINATION_LIBRARY_RULE');
    });

    test('the rule sits in the Library Usage section, before the Coding Rules', () => {
        const libraryUsageIdx = promptsSource.indexOf('## Library Usage and Importing libraries');
        const ruleIdx = promptsSource.indexOf('${PAGINATION_LIBRARY_RULE}');
        const codingRulesIdx = promptsSource.indexOf('## Coding Rules');
        expect(libraryUsageIdx).toBeGreaterThan(-1);
        expect(ruleIdx).toBeGreaterThan(libraryUsageIdx);
        expect(ruleIdx).toBeLessThan(codingRulesIdx);
    });
});
