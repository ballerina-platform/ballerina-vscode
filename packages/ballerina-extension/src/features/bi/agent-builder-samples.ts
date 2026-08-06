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

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';
import {
    AgentBuilderSample,
    AgentBuilderSamplesResponse,
    CreateAgentFromSampleRequest,
} from '@wso2/ballerina-core';
import { getAgentBuilderSamplesUrl } from '../../utils/config';
import { addPackageToToml, getUsername, openInVSCode, sanitizeName } from '../../utils/bi';

/**
 * The AI integration types offered by the Create Integration wizard, and the
 * create path behind them.
 *
 * Unlike every other category in that wizard, these do NOT come from the language
 * server's trigger models — they are a catalogue JSON in a GitHub repo, and picking
 * one copies a ready-made template rather than generating an artifact.
 */

/** Ref the templates themselves are pulled from. The catalogue carries no ref field. */
const TEMPLATE_REF = 'main';

/** `package.version` must be valid semver, so the templates never ship it unset. */
const DEFAULT_TEMPLATE_VERSION = '0.1.0';

/**
 * Placeholders the templates carry, substituted in file contents AND in paths.
 * Named after the `createBIProject` payload fields, uppercased, so the mapping to
 * the call site needs no translation table.
 *
 * Applied in ONE pass over an alternation, not sequentially: a value that happens to
 * contain a token name (an agent called "VERSION") must not be rescanned.
 */
function substituteTemplateTokens(text: string, tokens: Record<string, string>): string {
    const pattern = new RegExp(Object.keys(tokens).join('|'), 'g');
    return text.replace(pattern, (token) => tokens[token]);
}

/** Rough binary check, so a substitution pass never corrupts a non-text asset. */
function looksBinary(buffer: Buffer): boolean {
    return buffer.includes(0);
}

/**
 * Values for the template's placeholders, keyed by the token that carries them.
 * Named after the `createBIProject` payload fields, uppercased, so the mapping to
 * that call site needs no translation table.
 */
function buildTemplateTokens(params: CreateAgentFromSampleRequest): Record<string, string> {
    const { agentName, projectRoot, projectName, integrationName, packageName } = params;
    return {
        PROJECT_HANDLE: path.basename(path.resolve(projectRoot)),
        WORKSPACE_NAME: projectName,
        PACKAGE_NAME: sanitizeName(packageName),
        PROJECT_NAME: integrationName,
        AGENT_NAME: agentName,
        ORG_HANDLE: getUsername(),
        VERSION: DEFAULT_TEMPLATE_VERSION,
    };
}

interface GitHubRepoRef {
    owner: string;
    repo: string;
}

function parseGitHubRepo(repositoryUrl: string): GitHubRepoRef {
    let parsed: URL;
    try {
        parsed = new URL(repositoryUrl);
    } catch {
        throw new Error(`Not a valid repository URL: "${repositoryUrl}"`);
    }
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repo) {
        throw new Error(`Could not read owner/repo from "${repositoryUrl}"`);
    }
    return { owner, repo: repo.replace(/\.git$/, '') };
}

function toRawContentUrl(url: string): string {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url);
    return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}` : url;
}

export async function getAgentBuilderSamples(): Promise<AgentBuilderSamplesResponse> {
    const catalogueUrl = getAgentBuilderSamplesUrl();
    if (!catalogueUrl) {
        console.warn('[AgentBuilder] AGENT_BUILDER_SAMPLES_URL is not set — no AI integration types to offer.');
        return { samples: [] };
    }

    try {
        const response = await axios.get(toRawContentUrl(catalogueUrl), { responseType: 'json' });
        const samples: AgentBuilderSample[] = Array.isArray(response.data?.samples) ? response.data.samples : [];
        return { samples: samples.filter((sample) => sample?.repositoryUrl && sample?.componentPath) };
    } catch (error) {
        console.error('[AgentBuilder] Failed to read the agent sample catalogue:', error);
        return { samples: [] };
    }
}

/** One file of a template, with its path still carrying placeholders. */
interface TemplateFile {
    path: string;
    /** Payload left untyped: `unzipper` ships no declarations, and the bytes go
     *  straight back out to `writeFile`. */
    read: () => Promise<any>;
}

/**
 * The files under `sample.componentPath`, paths relative to it.
 *
 * GitHub cannot serve a subdirectory, so this pulls the whole repo archive and keeps
 * just the one subtree.
 */
async function fetchTemplateFiles(sample: AgentBuilderSample): Promise<TemplateFile[]> {
    const { owner, repo } = parseGitHubRepo(sample.repositoryUrl);
    const archiveUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${TEMPLATE_REF}`;

    let archive: Buffer;
    try {
        const response = await axios.get<ArrayBuffer>(archiveUrl, { responseType: 'arraybuffer' });
        archive = Buffer.from(response.data);
    } catch (error) {
        throw new Error(
            `Could not download the template from ${owner}/${repo} (${TEMPLATE_REF}): ` +
            `${error instanceof Error ? error.message : String(error)}`
        );
    }

    // GitHub archives nest everything under `<repo>-<ref>/`.
    const prefix = `${repo}-${TEMPLATE_REF}/${sample.componentPath.replace(/^\/+|\/+$/g, '')}/`;
    const directory = await unzipper.Open.buffer(archive);
    const files: TemplateFile[] = directory.files
        .filter((file: any) => file.type === 'File' && file.path.startsWith(prefix))
        .map((file: any) => ({ path: file.path.slice(prefix.length), read: () => file.buffer() }));

    if (files.length === 0) {
        throw new Error(`"${sample.componentPath}" was not found in ${owner}/${repo} on ${TEMPLATE_REF}.`);
    }
    return files;
}

/**
 * Creates the agent by copying its template into `projectRoot` with every placeholder
 * substituted, then opens the project.
 *
 * The template is laid out as a whole project — the workspace `Ballerina.toml` plus the
 * package directory beside it — and its contents ARE the project root's contents, so
 * they are written straight in. Nothing is re-rooted or dropped.
 *
 * When the project root already exists, only the package is taken from the template and
 * registered in the project's own workspace `Ballerina.toml`: its workspace file and
 * editor settings are already correct, and overwriting them would drop the packages it
 * already lists.
 */
export async function createAgentFromSample(params: CreateAgentFromSampleRequest): Promise<void> {
    const { sample, agentName, projectName } = params;
    const projectRoot = path.resolve(params.projectRoot);
    const packageName = sanitizeName(params.packageName);
    const packageDir = path.join(projectRoot, packageName);
    const workspaceToml = path.join(projectRoot, 'Ballerina.toml');
    // An existing project keeps its own workspace file; a new one takes the template's.
    const projectExists = fs.existsSync(workspaceToml);
    console.log(
        `[AgentBuilder] Creating "${sample.displayName}" as agent "${agentName}" ` +
        `in ${projectExists ? 'existing' : 'new'} project "${projectName}" at ${projectRoot}`
    );

    if (fs.existsSync(packageDir) && fs.readdirSync(packageDir).length > 0) {
        throw new Error(`"${packageDir}" already exists and is not empty.`);
    }

    const tokens = buildTemplateTokens(params);
    const files = await fetchTemplateFiles(sample);

    for (const file of files) {
        const destination = path.resolve(projectRoot, substituteTemplateTokens(file.path, tokens));
        // Everything must land inside the project root. Also the zip-slip guard: a
        // crafted archive must not write outside it.
        if (!destination.startsWith(projectRoot + path.sep)) {
            throw new Error(`Template entry "${file.path}" resolves outside "${projectRoot}".`);
        }
        // Project-level files belong to whoever created the project.
        if (projectExists && !destination.startsWith(packageDir + path.sep)) {
            continue;
        }
        const contents = await file.read();
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await fs.promises.writeFile(
            destination,
            looksBinary(contents) ? contents : substituteTemplateTokens(contents.toString('utf8'), tokens)
        );
    }

    if (projectExists) {
        await registerPackageInWorkspace(workspaceToml, packageName);
    }
    openInVSCode(projectRoot);
}

/** Adds the new package to an existing project's `workspace.packages`, if absent. */
async function registerPackageInWorkspace(workspaceToml: string, packageName: string): Promise<void> {
    const toml = await fs.promises.readFile(workspaceToml, 'utf8');
    if (new RegExp(`packages\\s*=\\s*\\[[^\\]]*"${packageName}"`).test(toml)) {
        return;
    }
    await fs.promises.writeFile(workspaceToml, addPackageToToml(toml, packageName));
}
