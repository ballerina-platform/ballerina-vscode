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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as unzipper from 'unzipper';

const VERSION_FILE = 'ballerina-version';
const TOOL_PROPERTIES = 'META-INF/tool.properties';
const LANG_JAR = /^ballerina-lang-\d[^/\\]*\.jar$/;

export interface BallerinaDistribution {
    /** What `bal home` prints: the active distribution's directory. */
    home: string;
    /** What `bal version` prints after "Ballerina ", e.g. "2201.14.0 (Swan Lake Update 14)". */
    version: string;
}

// Reads the files the `bal` launcher reads instead of starting a JVM; undefined means fall back to the CLI.
export async function resolveDistributionFromFiles(
    binDir: string,
    userHome: string = os.homedir()
): Promise<BallerinaDistribution | undefined> {
    const home = activeDistributionHome(path.dirname(path.resolve(binDir)), userHome);
    if (!home) {
        return undefined;
    }
    const version = await readDistributionVersion(home);
    return version ? { home, version } : undefined;
}

// Like the launcher, `bal dist use` (~/.ballerina/ballerina-version) wins over the installation default when installed.
export function activeDistributionHome(root: string, userHome: string): string | undefined {
    if (fs.existsSync(path.join(root, 'bre', 'lib'))) {
        return root;
    }
    const distributions = path.join(root, 'distributions');
    const installed = (name: string | undefined) =>
        name && fs.existsSync(path.join(distributions, name, 'bin')) ? path.join(distributions, name) : undefined;
    return installed(readVersionFile(path.join(userHome, '.ballerina', VERSION_FILE)))
        ?? installed(readVersionFile(path.join(distributions, VERSION_FILE)));
}

// Built from the `ballerina-lang` jar's META-INF/tool.properties, the way the launcher prints `bal version`.
export async function readDistributionVersion(home: string): Promise<string | undefined> {
    const libDir = path.join(home, 'bre', 'lib');
    let jarName: string | undefined;
    try {
        jarName = fs.readdirSync(libDir).find((name) => LANG_JAR.test(name));
    } catch {
        return undefined;
    }
    if (!jarName) {
        return undefined;
    }
    try {
        const jar = await unzipper.Open.file(path.join(libDir, jarName));
        const entry = jar.files.find((file) => file.path === TOOL_PROPERTIES);
        return entry ? formatVersion(parseProperties((await entry.buffer()).toString('utf8'))) : undefined;
    } catch {
        return undefined;
    }
}

export function formatVersion(properties: Record<string, string>): string | undefined {
    const packVersion = properties['ballerina.packVersion']?.replace('-SNAPSHOT', '');
    const channel = properties['ballerina.channel'];
    const minor = Number.parseInt(packVersion?.split('.')[1] ?? '', 10);
    if (!packVersion || !channel || Number.isNaN(minor)) {
        return undefined;
    }
    return `${packVersion} (${channel}${minor > 0 ? ` Update ${minor}` : ''})`;
}

// Follows symlinks, e.g. /usr/local/bin/bal → /Library/Ballerina/bin.
export function findLauncherDirOnPath(launcher: string, searchPath: string = process.env.PATH ?? ''): string | undefined {
    for (const dir of searchPath.split(path.delimiter)) {
        if (!dir) {
            continue;
        }
        const candidate = path.join(dir.replace(/^"|"$/g, ''), launcher);
        try {
            if (fs.statSync(candidate).isFile()) {
                return path.dirname(fs.realpathSync(candidate));
            }
        } catch {
            // Not on this PATH entry.
        }
    }
    return undefined;
}

function readVersionFile(file: string): string | undefined {
    try {
        return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    } catch {
        return undefined;
    }
}

function parseProperties(text: string): Record<string, string> {
    const properties: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        const match = /^\s*([^#!=:\s][^=:]*?)\s*[=:]\s*(.*?)\s*$/.exec(line);
        if (match) {
            properties[match[1]] = match[2];
        }
    }
    return properties;
}
