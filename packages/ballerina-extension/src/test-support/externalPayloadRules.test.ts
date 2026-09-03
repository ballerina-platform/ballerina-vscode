/**
 * Tests for the external-payload binding rules injected into the agent system
 * prompt (src/features/ai/agent/payload-binding-rules.ts), their wiring into
 * getSystemPrompt (src/features/ai/agent/prompts.ts), and the matching
 * closed-record warning in the langlib instructions.
 *
 * The wiring check reads prompts.ts as source text instead of importing it:
 * prompts.ts transitively pulls in the extension-host module graph
 * (StateMachine, language client), which must not load in this jest suite.
 */
import * as fs from 'fs';
import * as path from 'path';
import { EXTERNAL_PAYLOAD_BINDING_RULES } from '../features/ai/agent/payload-binding-rules';
import { LANGLIB_USAGE_INSTRUCTIONS } from '../features/ai/utils/libs/langlibs';

describe('EXTERNAL_PAYLOAD_BINDING_RULES content', () => {
    test('scopes closed records to owned schemas', () => {
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).toMatch(/closed records \(`record \{\| \.\.\. \|\}`\) only for data whose shape you fully control/);
    });

    test('mandates open records for external payloads with concrete examples', () => {
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).toMatch(/EXTERNAL system you do not control/);
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).toMatch(/AWS S3\/SQS notifications/);
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).toMatch(/OPEN records \(`record \{ \.\.\. \}`\)/);
    });

    test('names the failing conversions and the optional-field escape hatch', () => {
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).toMatch(/`cloneWithType`\/`fromJsonStringWithType` fail at runtime/);
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).toMatch(/optional \(`fieldName\?`\)/);
    });

    test('is a bullet list with no unresolved interpolations or stray backtick escapes', () => {
        expect(EXTERNAL_PAYLOAD_BINDING_RULES.startsWith('- ')).toBe(true);
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).not.toContain('${');
        expect(EXTERNAL_PAYLOAD_BINDING_RULES).not.toContain('\\`');
    });
});

describe('system prompt wiring', () => {
    const promptsSource = fs.readFileSync(
        path.join(__dirname, '../features/ai/agent/prompts.ts'),
        'utf-8',
    );

    test('prompts.ts imports the rules constant', () => {
        const importStatement = promptsSource.match(/import \{[^}]*\} from "\.\/payload-binding-rules"/);
        expect(importStatement).not.toBeNull();
        expect(importStatement![0]).toContain('EXTERNAL_PAYLOAD_BINDING_RULES');
    });

    test('the rules sit inside the Coding Rules section', () => {
        const codingRulesIdx = promptsSource.indexOf('## Coding Rules');
        const rulesIdx = promptsSource.indexOf('${EXTERNAL_PAYLOAD_BINDING_RULES}');
        const fileModsIdx = promptsSource.indexOf('## File modifications');
        expect(codingRulesIdx).toBeGreaterThan(-1);
        expect(rulesIdx).toBeGreaterThan(codingRulesIdx);
        expect(rulesIdx).toBeLessThan(fileModsIdx);
    });
});

describe('langlib closed-record warning', () => {
    test('warns that cloneWithType into a closed record fails on unmodeled fields', () => {
        expect(LANGLIB_USAGE_INSTRUCTIONS).toMatch(/CLOSED record \(record \{\| \.\.\. \|\}\) fail at runtime/);
        expect(LANGLIB_USAGE_INSTRUCTIONS).toMatch(/use an OPEN record \(record \{ \.\.\. \}\)/);
        expect(LANGLIB_USAGE_INSTRUCTIONS).toMatch(/external system you do not control/);
    });

    test('marks the closed-record example as an owned shape so it cannot contradict the warning', () => {
        expect(LANGLIB_USAGE_INSTRUCTIONS).toMatch(/owned shape \(you control it\), so a closed record is fine here/);
    });
});
