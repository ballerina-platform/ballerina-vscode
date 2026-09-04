/**
 * Tests for the module-init ordering rules injected into the agent system
 * prompt (src/features/ai/agent/module-init-rules.ts) and their wiring into
 * getSystemPrompt (src/features/ai/agent/prompts.ts).
 *
 * The wiring check reads prompts.ts as source text instead of importing it:
 * prompts.ts transitively pulls in the extension-host module graph
 * (StateMachine, language client), which must not load in this jest suite.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MODULE_INIT_CODING_RULES } from '../features/ai/agent/module-init-rules';

describe('MODULE_INIT_CODING_RULES content', () => {
    test('teaches unconditional single assignment in init()', () => {
        expect(MODULE_INIT_CODING_RULES).toMatch(/assign it in `init\(\)` exactly once, unconditionally/);
        expect(MODULE_INIT_CODING_RULES).toMatch(/reports the variable as uninitialized/);
    });

    test('prefers initialization at declaration', () => {
        expect(MODULE_INIT_CODING_RULES).toMatch(/Prefer initializing module-level variables at their declaration/);
    });

    test('keeps the init()-assigned variable final', () => {
        expect(MODULE_INIT_CODING_RULES).toMatch(/declare the variable `final`/);
    });

    test('teaches that init() runs after module-level initializers and service declarations', () => {
        expect(MODULE_INIT_CODING_RULES).toMatch(/`init\(\)` runs AFTER every module-level variable initializer/);
        expect(MODULE_INIT_CODING_RULES).toMatch(/must never read a variable that is only assigned inside `init\(\)`/);
    });

    test('is a bullet list with no unresolved interpolations or stray backtick escapes', () => {
        expect(MODULE_INIT_CODING_RULES.startsWith('- ')).toBe(true);
        expect(MODULE_INIT_CODING_RULES).not.toContain('${');
        expect(MODULE_INIT_CODING_RULES).not.toContain('\\`');
    });
});

describe('system prompt wiring', () => {
    const promptsSource = fs.readFileSync(
        path.join(__dirname, '../features/ai/agent/prompts.ts'),
        'utf-8',
    );

    test('prompts.ts imports the rules constant', () => {
        const importStatement = promptsSource.match(/import \{[^}]*\} from "\.\/module-init-rules"/);
        expect(importStatement).not.toBeNull();
        expect(importStatement![0]).toContain('MODULE_INIT_CODING_RULES');
    });

    test('the rules sit inside the Coding Rules section', () => {
        const codingRulesIdx = promptsSource.indexOf('## Coding Rules');
        const rulesIdx = promptsSource.indexOf('${MODULE_INIT_CODING_RULES}');
        const fileModsIdx = promptsSource.indexOf('## File modifications');
        expect(codingRulesIdx).toBeGreaterThan(-1);
        expect(rulesIdx).toBeGreaterThan(codingRulesIdx);
        expect(rulesIdx).toBeLessThan(fileModsIdx);
    });
});
