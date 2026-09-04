/**
 * Tests for array-typed configurable support in Config.toml handling
 * (src/utils/toml-utils.ts).
 *
 * Regression coverage for: a `string[] & readonly` configurable (e.g. OAuth
 * `scopes`) collected through the config popup was written to Config.toml as a
 * quoted scalar (`scopes = "a"`), failing at runtime with
 * "configurable variable 'scopes' is expected to be of type 'string[] & readonly',
 * but found 'string'". Arrays were also invisible to the status check (a filled
 * array re-reported as missing) and dropped by the pre-fill read-back.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from '@iarna/toml';
import {
    getAllConfigStatus,
    isArrayConfigType,
    normalizeConfigType,
    parseArrayConfigValue,
    readExistingConfigValues,
    writeConfigValuesToConfig,
} from '../utils/toml-utils';

const ORG = 'testorg';
const PKG = 'testpkg';

let tempDir: string;
let configPath: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toml-array-test-'));
    configPath = path.join(tempDir, 'Config.toml');
});

afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

function readSection(): Record<string, any> {
    const parsed = parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
    return parsed[ORG][PKG];
}

describe('normalizeConfigType / isArrayConfigType', () => {
    test.each([
        ['string[]', 'string[]'],
        ['string[] & readonly', 'string[]'],
        ['(string[] & readonly)', 'string[]'],
        ['readonly & string[]', 'string[]'],
        ['int[]', 'int[]'],
        ['string', 'string'],
        [undefined, 'string'],
    ])('normalizes %s to %s', (input, expected) => {
        expect(normalizeConfigType(input as string | undefined)).toBe(expected);
    });

    test.each([
        ['string[]', true],
        ['string[] & readonly', true],
        ['int[]', true],
        ['string', false],
        ['boolean', false],
        [undefined, false],
        // Non-primitive element types must fall through to the scalar path so a
        // mistyped value fails loudly at startup instead of being coerced.
        ['json[]', false],
        ['anydata[]', false],
        ['Server[]', false],
        ['int[][]', false],
    ])('isArrayConfigType(%s) === %s', (input, expected) => {
        expect(isArrayConfigType(input as string | undefined)).toBe(expected);
    });
});

describe('parseArrayConfigValue', () => {
    test('parses comma-separated string values', () => {
        expect(parseArrayConfigValue('read, write , admin', 'string[]', 'scopes'))
            .toEqual(['read', 'write', 'admin']);
    });

    test('parses a JSON array of strings', () => {
        expect(parseArrayConfigValue('["read", "write"]', 'string[] & readonly', 'scopes'))
            .toEqual(['read', 'write']);
    });

    test('strips matching quotes from comma-separated items', () => {
        expect(parseArrayConfigValue('"read", \'write\'', 'string[]', 'scopes'))
            .toEqual(['read', 'write']);
    });

    test('drops empty items (trailing commas)', () => {
        expect(parseArrayConfigValue('read,, write, ', 'string[]', 'scopes'))
            .toEqual(['read', 'write']);
    });

    test('coerces int[] elements to numbers', () => {
        expect(parseArrayConfigValue('8080, 9090', 'int[]', 'ports')).toEqual([8080, 9090]);
        expect(parseArrayConfigValue('[8080, 9090]', 'int[] & readonly', 'ports')).toEqual([8080, 9090]);
    });

    test('normalizes JSON-branch elements like the comma branch (trim, unquote, drop empties)', () => {
        expect(parseArrayConfigValue('["1", " ", ""]', 'int[]', 'ports')).toEqual([1]);
        expect(parseArrayConfigValue('[" true "]', 'boolean[]', 'flags')).toEqual([true]);
        expect(parseArrayConfigValue('[" a "]', 'string[]', 'scopes')).toEqual(['a']);
    });

    test('coerces decimal[] and boolean[] elements', () => {
        expect(parseArrayConfigValue('1.5, 2', 'decimal[]', 'rates')).toEqual([1.5, 2]);
        expect(parseArrayConfigValue('true, false', 'boolean[]', 'flags')).toEqual([true, false]);
    });

    test('rejects non-integer elements for int[]', () => {
        expect(() => parseArrayConfigValue('8080, abc', 'int[]', 'ports'))
            .toThrow(/Invalid integer element 'abc' in array value for ports/);
    });

    test('rejects non-boolean elements for boolean[]', () => {
        expect(() => parseArrayConfigValue('true, maybe', 'boolean[]', 'flags'))
            .toThrow(/Invalid boolean element 'maybe'/);
    });

    test('rejects malformed bracketed input with a clear error', () => {
        expect(() => parseArrayConfigValue('[read, write', 'string[]', 'scopes'))
            .toThrow(/Invalid array value for scopes/);
    });

    test('rejects non-primitive JSON elements instead of String()-coercing them', () => {
        expect(() => parseArrayConfigValue('[{"a": 1}]', 'string[]', 'scopes'))
            .toThrow(/only string, number, and boolean elements are supported/);
        expect(() => parseArrayConfigValue('[[1, 2], [3]]', 'string[]', 'scopes'))
            .toThrow(/only string, number, and boolean elements are supported/);
        expect(() => parseArrayConfigValue('[null]', 'string[]', 'scopes'))
            .toThrow(/only string, number, and boolean elements are supported/);
    });

    test('rejects hex and exponent forms for int[] elements (strict digits)', () => {
        expect(() => parseArrayConfigValue('0x10, 8', 'int[]', 'ports'))
            .toThrow(/Invalid integer element '0x10'/);
        expect(() => parseArrayConfigValue('1e3', 'int[]', 'ports'))
            .toThrow(/Invalid integer element '1e3'/);
    });

    test('an explicit empty JSON array yields an empty array', () => {
        expect(parseArrayConfigValue('[]', 'string[]', 'scopes')).toEqual([]);
    });
});

describe('writeConfigValuesToConfig with array types', () => {
    test('writes a string[] configurable as a real TOML array (the reported scopes bug)', () => {
        writeConfigValuesToConfig(
            configPath,
            { scopes: 'https://mail.example/send, https://mail.example/read', tokenUrl: 'https://sts.example/token' },
            [
                { name: 'scopes', description: '', type: 'string[] & readonly' },
                { name: 'tokenUrl', description: '', type: 'string' },
            ],
            ORG,
            PKG,
        );

        const section = readSection();
        expect(section.scopes).toEqual(['https://mail.example/send', 'https://mail.example/read']);
        expect(section.tokenUrl).toBe('https://sts.example/token');
    });

    test('accepts JSON-array input for a string[] configurable', () => {
        writeConfigValuesToConfig(
            configPath,
            { scopes: '["a", "b"]' },
            [{ name: 'scopes', description: '', type: 'string[]' }],
            ORG,
            PKG,
        );
        expect(readSection().scopes).toEqual(['a', 'b']);
    });

    test('writes int[] values as plain digits (no @iarna/toml underscores)', () => {
        writeConfigValuesToConfig(
            configPath,
            { ports: '8080, 9090, 123456' },
            [{ name: 'ports', description: '', type: 'int[]' }],
            ORG,
            PKG,
        );

        const raw = fs.readFileSync(configPath, 'utf-8');
        expect(raw).not.toMatch(/\d_\d/);
        expect(readSection().ports).toEqual([8080, 9090, 123456]);
    });

    test('de-underscores numeric arrays even when @iarna/toml wraps them across lines', () => {
        // 30 large elements force @iarna/toml's multiline array formatting — the
        // riskiest path for the bracket-scoped underscore regex.
        const values = Array.from({ length: 30 }, (_v, i) => 100000 + i * 1111);
        writeConfigValuesToConfig(
            configPath,
            { ports: values.join(', ') },
            [{ name: 'ports', description: '', type: 'int[]' }],
            ORG,
            PKG,
        );

        const raw = fs.readFileSync(configPath, 'utf-8');
        expect(raw).not.toMatch(/\d_\d/);
        expect(readSection().ports).toEqual(values);
    });

    test('a non-primitive array type falls through to the scalar path (fails loudly at startup, not silently)', () => {
        writeConfigValuesToConfig(
            configPath,
            { servers: 'a, b' },
            [{ name: 'servers', description: '', type: 'json[]' }],
            ORG,
            PKG,
        );
        // Written verbatim as a string — Ballerina rejects it at startup instead
        // of running with silently coerced data.
        expect(readSection().servers).toBe('a, b');
    });

    test('scalar types keep their existing behavior alongside arrays', () => {
        writeConfigValuesToConfig(
            configPath,
            { port: '8080', rate: '1.5', enabled: 'true', host: 'db.example', scopes: 'a, b' },
            [
                { name: 'port', description: '', type: 'int' },
                { name: 'rate', description: '', type: 'decimal' },
                { name: 'enabled', description: '', type: 'boolean' },
                { name: 'host', description: '', type: 'string' },
                { name: 'scopes', description: '', type: 'string[]' },
            ],
            ORG,
            PKG,
        );

        const section = readSection();
        expect(section.port).toBe(8080);
        expect(section.rate).toBe(1.5);
        expect(section.enabled).toBe(true);
        expect(section.host).toBe('db.example');
        expect(section.scopes).toEqual(['a', 'b']);
    });

    test('readonly-intersected scalar types dispatch to their base branch', () => {
        writeConfigValuesToConfig(
            configPath,
            { port: '8080', enabled: 'false' },
            [
                { name: 'port', description: '', type: 'int & readonly' },
                { name: 'enabled', description: '', type: 'boolean & readonly' },
            ],
            ORG,
            PKG,
        );

        const section = readSection();
        expect(section.port).toBe(8080);
        expect(section.enabled).toBe(false);
    });

    test('propagates element-coercion failures as errors', () => {
        expect(() =>
            writeConfigValuesToConfig(
                configPath,
                { ports: 'eight' },
                [{ name: 'ports', description: '', type: 'int[]' }],
                ORG,
                PKG,
            ),
        ).toThrow(/Invalid integer element/);
    });
});

describe('array values in status and read-back', () => {
    beforeEach(() => {
        writeConfigValuesToConfig(
            configPath,
            { scopes: 'read, write', host: 'db.example' },
            [
                { name: 'scopes', description: '', type: 'string[]' },
                { name: 'host', description: '', type: 'string' },
            ],
            ORG,
            PKG,
        );
    });

    test('getAllConfigStatus reports a filled array as filled (check-mode regression)', () => {
        const status = getAllConfigStatus(configPath, ORG, PKG);
        expect(status.scopes).toBe('filled');
        expect(status.host).toBe('filled');
    });

    test('getAllConfigStatus still excludes tables and arrays of tables', () => {
        fs.writeFileSync(
            configPath,
            `[${ORG}.${PKG}]\nscopes = ["read"]\n\n[${ORG}.${PKG}.nested]\nkey = "v"\n\n[[${ORG}.${PKG}.servers]]\nhost = "a"\n`,
            'utf-8',
        );
        const status = getAllConfigStatus(configPath, ORG, PKG);
        expect(status.scopes).toBe('filled');
        expect(status.nested).toBeUndefined();
        expect(status.servers).toBeUndefined();
    });

    test('readExistingConfigValues round-trips arrays through JSON for the pre-fill form', () => {
        const values = readExistingConfigValues(configPath, ['scopes', 'host'], ORG, PKG);
        expect(values.host).toBe('db.example');
        expect(values.scopes).toBe('["read","write"]');
        // The JSON form must be accepted straight back by the array parser.
        expect(parseArrayConfigValue(values.scopes, 'string[]', 'scopes')).toEqual(['read', 'write']);
    });

    test('readExistingConfigValues survives BigInt array elements (huge TOML integers)', () => {
        fs.writeFileSync(
            configPath,
            `[${ORG}.${PKG}]\nbig = [9223372036854775807]\n`,
            'utf-8',
        );
        // @iarna/toml surfaces this as BigInt; JSON.stringify would throw without the guard.
        const values = readExistingConfigValues(configPath, ['big'], ORG, PKG);
        expect(values.big).toBe('["9223372036854775807"]');
    });

    test('readExistingConfigValues excludes arrays of tables from the pre-fill', () => {
        fs.writeFileSync(
            configPath,
            `[[${ORG}.${PKG}.servers]]\nhost = "a"\n`,
            'utf-8',
        );
        const values = readExistingConfigValues(configPath, ['servers'], ORG, PKG);
        expect(values.servers).toBeUndefined();
    });
});

describe('system prompt configurable-types rule', () => {
    // The old rule ("Use only string, int, decimal, boolean types in configurable
    // variables") made array configurables like OAuth string[] scopes impossible
    // to declare legally, while connectors require them. Read prompts.ts as
    // source text — importing it would load the extension-host module graph.
    const promptsSource = fs.readFileSync(
        path.join(__dirname, '../features/ai/agent/prompts.ts'),
        'utf-8',
    );

    test('admits arrays of primitives in configurable variables', () => {
        expect(promptsSource).toContain('or an array of one of these when the configuration is inherently a list');
        expect(promptsSource).toContain('configurable string[] scopes = ?;');
        expect(promptsSource).not.toContain('Use only string, int, decimal, boolean types in configurable variables');
    });
});
