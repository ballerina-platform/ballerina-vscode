/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * @jest-environment node
 *
 * Catches drift between the hardcoded codepoints in contributes.icons and the font the VSIX
 * actually ships. fantasticon assigns codepoints sequentially over the SVGs in the font
 * package's icons directory, so adding one icon upstream shifts the codepoint of every icon
 * after it. The font is rebuilt from the wso2-vscode-extensions submodule on every build while
 * the table in package.json is maintained by hand, so the two drifted and $(ballerina-debug)
 * ended up rendering custom.svg — a blob that reads as a chat icon (wso2/product-integrator#2288).
 *
 * Nothing else notices: a shifted codepoint is still a valid glyph, so the icon renders, just
 * the wrong one. Only a human looking at the toolbar catches it, which is how it shipped.
 */

import * as fs from 'fs';
import * as path from 'path';

const WSO2_FONT = 'wso2-vscode.woff';
const extensionRoot = path.resolve(__dirname, '..', '..');

// Prefer the copy copyFonts stages into resources/ — that is the one the VSIX ships and the one
// fontPath resolves against, so it also catches a stale staged copy. Fall back to the dependency's
// own dist so the test still runs on a tree that has been installed but not packaged.
const fontMapPath = [
    path.join(extensionRoot, 'resources', 'font-wso2-vscode', 'dist', 'wso2-vscode.json'),
    path.join(extensionRoot, 'node_modules', '@wso2', 'font-wso2-vscode', 'dist', 'wso2-vscode.json'),
].find((candidate) => fs.existsSync(candidate));

if (!fontMapPath) {
    throw new Error(
        'wso2-vscode.json not found in resources/font-wso2-vscode/dist or in the ' +
            '@wso2/font-wso2-vscode dependency. The font is generated from the ' +
            'wso2-vscode-extensions submodule, so build it first (rush build --to ballerina) or ' +
            'run pnpm run copyFonts.'
    );
}

interface IconContribution {
    description: string;
    default: { fontPath: string; fontCharacter: string };
}

// fantasticon keys this map by the source SVG's basename, and contributes.icons carries that
// basename in 'description'. That is the only link between an icon id and a glyph, so keep
// 'description' equal to the SVG name rather than making it a human-readable blurb.
const fontMap: Record<string, number> = JSON.parse(fs.readFileSync(fontMapPath, 'utf-8'));
const glyphAt = new Map(Object.entries(fontMap).map(([name, codepoint]): [number, string] => [codepoint, name]));

const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf-8'));
const wso2Icons: [string, IconContribution][] = Object.entries(
    packageJson.contributes.icons as Record<string, IconContribution>
).filter(([, icon]) => icon.default.fontPath.endsWith(WSO2_FONT));

// Icons whose SVG was renamed or dropped upstream, leaving the entry pointing at nothing. Nothing
// references any of them via $(id) today, so they render nowhere; they are kept for a follow-up
// that repoints or removes them. Anything new landing in this list is a regression — either a
// description that stopped matching its SVG, or an icon that upstream took away while we use it.
const KNOWN_STALE = [
    'ballerina-agent-view',
    'ballerina-cached-rounded',
    'ballerina-delete',
    'ballerina-new-module',
    'ballerina-source-view',
];

describe('contributes.icons', () => {
    it('uses the codepoint the shipped font assigns to each icon', () => {
        const drifted = wso2Icons
            .filter(([, icon]) => fontMap[icon.description] !== undefined)
            .map(([id, icon]) => {
                const expected = `\\${fontMap[icon.description].toString(16)}`;
                if (icon.default.fontCharacter === expected) {
                    return undefined;
                }
                const declared = parseInt(icon.default.fontCharacter.replace('\\', ''), 16);
                const rendersAs = glyphAt.get(declared) ?? 'nothing';
                return `${id} declares ${icon.default.fontCharacter} (renders ${rendersAs}), font puts '${icon.description}' at ${expected}`;
            })
            .filter((message): message is string => message !== undefined);

        expect(drifted).toEqual([]);
    });

    it('names no icon the font has dropped, beyond the entries already known to be stale', () => {
        const unresolvable = wso2Icons
            .filter(([, icon]) => fontMap[icon.description] === undefined)
            .map(([id, icon]) => `${id} (looked up '${icon.description}')`);

        expect(unresolvable.sort()).toEqual(
            KNOWN_STALE.map((id) => `${id} (looked up '${packageJson.contributes.icons[id].description}')`).sort()
        );
    });
});
