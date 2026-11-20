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

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { AgentManagerLinkCandidate, AgentManagerRemote, AgentManagerRepoDetails, AgentManagerSourceCheck, AgentManagerSourceStep, AgentManagerSource } from "@wso2/ballerina-core";
import { api, MANIFEST_FILE } from "./client";
import { detectEol } from "../ai/utils/eol-utils";

const GITHUB_REPO_URL = /^(?:https?:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;
const REPO_INFO_TTL_MS = 10 * 60 * 1000;
export const LOCAL_ONLY_FILES = ["Config.toml", "trace_enabled.bal"];

export type SourceStepId =
    | "gitMissing" | "prepare" | "publishRepo" | "nonGitHub" | "detached"
    | "commitFirst" | "publishBranch" | "commit" | "push" | "syncGitHub" | "refreshSpec" | "openSpec";

export interface SourceFacts {
    root?: string;
    appPath?: string;
    remoteName?: string;
    repository?: string;
    branch?: string;
    upstreamBranch?: string;
    remoteCommit?: string;
    /** The package folder isn't in the commit the branch has on its remote, so a deploy would build nothing. */
    missingOnRemote?: boolean;
    ahead: number;
    dirty: number;
    /** Uncommitted changes a build would use; the Agent Manager link file isn't read by builds. */
    buildChanges: number;
    /** Changed `Config.toml` files below the package root, relative to it. */
    changedConfigs: string[];
    hasRemotes: boolean;
    gitMissing: boolean;
}

export interface Preparation {
    openApiSpec: boolean;
    ampImport: boolean;
    exposedFiles: string[];
    gitignore: boolean;
    buildFiles: string[];
    /** What keeps openapi.yaml from describing the service, when anything does. */
    specStep?: AgentManagerSourceStep;
}

const repoInfoCache = new Map<string, { isPrivate?: boolean; at: number }>();

interface GitResult {
    status: number;
    stdout: string;
    stderr: string;
    missing: boolean;
}

// Runs off the extension host's thread and never prompts, so a missing credential fails instead of hanging.
export function git(cwd: string, args: string[], timeout = 30_000): Promise<GitResult> {
    return new Promise((resolve) => {
        cp.execFile("git", args, { cwd, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }, (error, stdout, stderr) => {
            const code = (error as { code?: number | string } | null)?.code;
            resolve({ status: error ? (typeof code === "number" ? code : -1) : 0, stdout: String(stdout), stderr: String(stderr), missing: code === "ENOENT" });
        });
    });
}

async function out(cwd: string, args: string[]): Promise<string | undefined> {
    const result = await git(cwd, args);
    return result.status === 0 ? result.stdout.trim() : undefined;
}

const repoFromUrl = (url?: string) => url?.match(GITHUB_REPO_URL)?.slice(1, 3).join("/");

export async function readFacts(projectPath: string): Promise<SourceFacts> {
    const facts: SourceFacts = { ahead: 0, dirty: 0, buildChanges: 0, changedConfigs: [], hasRemotes: false, gitMissing: false };
    const root = await git(projectPath, ["rev-parse", "--show-toplevel"]);
    if (root.missing) {
        return { ...facts, gitMissing: true };
    }
    facts.root = root.status === 0 ? root.stdout.trim() : undefined;
    if (!facts.root) {
        return facts;
    }
    // Git's own prefix avoids path.relative, which breaks when the folder's case differs from what's on disk.
    facts.appPath = "/" + ((await out(projectPath, ["rev-parse", "--show-prefix"])) ?? "").replace(/\/$/, "");
    const remotes = ((await out(projectPath, ["remote", "-v"])) ?? "").split("\n").filter(Boolean).map((line) => line.split(/\s+/));
    facts.hasRemotes = remotes.length > 0;
    facts.branch = await out(projectPath, ["symbolic-ref", "-q", "--short", "HEAD"]);
    // The repository must be the one the branch pushes to, or builds would use a different remote's code.
    const upstreamRemote = facts.branch ? await out(projectPath, ["config", "--get", `branch.${facts.branch}.remote`]) : undefined;
    const chosen = upstreamRemote
        ? remotes.find(([name]) => name === upstreamRemote)
        : remotes.find(([, url]) => GITHUB_REPO_URL.test(url ?? ""));
    facts.repository = repoFromUrl(chosen?.[1]);
    facts.remoteName = facts.repository && chosen![0];
    const merge = facts.branch ? await out(projectPath, ["config", "--get", `branch.${facts.branch}.merge`]) : undefined;
    facts.upstreamBranch = upstreamRemote && merge ? merge.replace(/^refs\/heads\//, "") : undefined;
    facts.remoteCommit = facts.upstreamBranch ? await out(projectPath, ["rev-parse", "@{u}"]) : undefined;
    const folder = facts.appPath.slice(1);
    facts.missingOnRemote = !facts.remoteCommit
        || (!!folder && (await git(projectPath, ["cat-file", "-e", `${facts.remoteCommit}:${folder}`])).status !== 0);
    facts.ahead = Number(await out(projectPath, ["rev-list", "--count", "@{u}..HEAD"])) || 0;
    const changed = await statusEntries(projectPath);
    facts.dirty = changed.length;
    const prefix = folder ? `${folder}/` : "";
    const linkFile = prefix + MANIFEST_FILE.split(path.sep).join("/");
    facts.buildChanges = changed.filter(({ file }) => file !== linkFile).length;
    // Commit and Push ignores an exposed Config.toml with a rule that also matches untracked nested ones.
    const untrackedIgnored = await isExposed(projectPath, "Config.toml", true);
    facts.changedConfigs = changed
        .filter(({ code }) => !(untrackedIgnored && code === "??"))
        .map(({ file }) => file.slice(prefix.length))
        .filter((file) => file.endsWith("/Config.toml"));
    return facts;
}

// Only this package's folder counts: in a workspace, other packages' changes don't reach this agent's build.
async function statusEntries(packagePath: string, pathspec = ["."]): Promise<{ code: string; file: string }[]> {
    // Each line is `XY path` and X may be a space, so the output isn't trimmed before the status is cut off.
    const status = await git(packagePath, ["status", "--porcelain", "-uall", "--", ...pathspec]);
    return status.status === 0 ? status.stdout.split("\n").filter(Boolean).map((line) => ({ code: line.slice(0, 2), file: line.slice(3).trim() })) : [];
}

export async function isExposed(projectPath: string, file: string, inRepo: boolean): Promise<boolean> {
    if (!fs.existsSync(path.join(projectPath, file))) {
        return false;
    }
    return inRepo ? (await git(projectPath, ["check-ignore", "-q", file])).status !== 0 : !listedInGitignore(projectPath, file);
}

export async function isIgnored(projectPath: string, entry: string, inRepo: boolean): Promise<boolean> {
    return inRepo ? (await git(projectPath, ["check-ignore", "-q", "--no-index", entry])).status === 0 : listedInGitignore(projectPath, entry);
}

function listedInGitignore(projectPath: string, entry: string): boolean {
    const gitignore = path.join(projectPath, ".gitignore");
    const lines = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf-8").split("\n").map((line) => line.trim()) : [];
    return lines.includes(entry) || lines.includes(`/${entry}`);
}

// The unauthenticated API 404s for private repositories; any other failure (e.g. rate limiting) leaves visibility unknown.
async function isPrivateRepo(repository: string): Promise<boolean | undefined> {
    const cached = repoInfoCache.get(repository);
    if (cached && Date.now() - cached.at < REPO_INFO_TTL_MS) {
        return cached.isPrivate;
    }
    let isPrivate: boolean | undefined;
    try {
        const response = await fetch(`https://api.github.com/repos/${repository}`, { headers: { Accept: "application/vnd.github+json" } });
        if (response.ok) {
            isPrivate = ((await response.json()) as { private: boolean }).private;
        } else if (response.status === 404) {
            isPrivate = true;
        }
    } catch { /* unknown */ }
    repoInfoCache.set(repository, { isPrivate, at: Date.now() });
    return isPrivate;
}

function preparationStep(prep: Preparation): AgentManagerSourceStep | undefined {
    const files = [prep.openApiSpec && "openapi.yaml", prep.gitignore && ".gitignore"].filter(Boolean);
    if (files.length === 0 && prep.exposedFiles.length === 0 && !prep.ampImport) {
        return undefined;
    }
    const parts = [
        files.length > 0 && `Agent Manager needs ${files.join(", ")}`,
        prep.exposedFiles.length > 0 && `${prep.exposedFiles.join(" and ")} must stay out of Git`,
    ].filter(Boolean);
    const message = parts.length > 0 ? `${parts.join(". ")}.` : "Agent Manager can collect this agent's traces.";
    return { id: "prepare", message, actionLabel: "Prepare Project", blocking: true, offerAutoInstrumentation: prep.ampImport };
}

// Deploys build the upstream commit, so the files the build needs (and must not see) are checked there, not on disk.
async function gitHubStep(projectPath: string, facts: SourceFacts, prep: Preparation): Promise<AgentManagerSourceStep | undefined> {
    const commit = facts.remoteCommit;
    if (!commit) {
        return undefined;
    }
    const inCommit = async (file: string) => (await git(projectPath, ["cat-file", "-e", `${commit}:./${file}`])).status === 0;
    const [buildFilesPresent, localFilesPresent] = await Promise.all([
        Promise.all(prep.buildFiles.map(inCommit)), Promise.all(LOCAL_ONLY_FILES.map(inCommit)),
    ]);
    const missing = prep.buildFiles.filter((_, index) => !buildFilesPresent[index]);
    const leaked = LOCAL_ONLY_FILES.filter((_, index) => localFilesPresent[index]);
    if (missing.length === 0 && leaked.length === 0) {
        return undefined;
    }
    const parts = [
        missing.length > 0 && `GitHub doesn't have ${missing.join(" or ")} yet`,
        leaked.length > 0 && `${leaked.join(" and ")} is still on GitHub`,
    ].filter(Boolean);
    const commitFirst = facts.dirty > 0;
    return {
        id: "syncGitHub",
        message: `${parts.join(", and ")}. ${commitFirst ? "Commit and push" : "Push"} your changes before deploying.`,
        actionLabel: commitFirst ? "Review and Commit" : "Push",
        blocking: true,
    };
}

const NOT_ON_GITHUB = "The latest changes aren't on GitHub yet, so they won't be deployed.";

const GIT_MISSING: AgentManagerSourceStep = { id: "gitMissing", message: "Git isn't installed. It's needed to put this code on GitHub.", actionLabel: "Download Git", blocking: true };
const PUBLISH_REPO: AgentManagerSourceStep = { id: "publishRepo", message: "Not on GitHub yet.", actionLabel: "Publish to GitHub", blocking: true };
const NON_GITHUB: AgentManagerSourceStep = { id: "nonGitHub", message: "This repository's remote isn't on GitHub, and deploys build from GitHub only.", blocking: true };
const DETACHED: AgentManagerSourceStep = { id: "detached", message: "Not on a branch.", actionLabel: "Check Out a Branch", blocking: true };

// What keeps the source from being pushed to GitHub at all; a deploy can't go past the push until it is resolved.
export function pushBlocker(facts: SourceFacts): AgentManagerSourceStep | undefined {
    if (facts.gitMissing) {
        return GIT_MISSING;
    }
    if (!facts.repository) {
        return facts.hasRemotes ? NON_GITHUB : PUBLISH_REPO;
    }
    return facts.branch ? undefined : DETACHED;
}

async function sourceSteps(projectPath: string, facts: SourceFacts, prep: Preparation): Promise<(AgentManagerSourceStep | false | undefined)[]> {
    const onGitHub = !!facts.upstreamBranch;
    return [
        facts.gitMissing && GIT_MISSING,
        preparationStep(prep),
        !facts.repository && !facts.hasRemotes && PUBLISH_REPO,
        !facts.repository && NON_GITHUB,
        !facts.branch && DETACHED,
        !onGitHub && facts.dirty > 0 && { id: "commitFirst", message: `${facts.dirty} ${facts.dirty === 1 ? "change" : "changes"} to commit before publishing.`, actionLabel: "Review and Commit", blocking: true },
        !onGitHub && { id: "publishBranch", message: `${facts.branch} isn't on GitHub yet.`, actionLabel: "Publish Branch", blocking: true },
        await gitHubStep(projectPath, facts, prep),
        prep.specStep,
        facts.buildChanges > 0 && { id: "commit", message: NOT_ON_GITHUB, actionLabel: "Review and Commit", blocking: false },
        facts.ahead > 0 && { id: "push", message: NOT_ON_GITHUB, actionLabel: "Push", blocking: false },
    ];
}

/** Changed files elsewhere in the repository, which this package's deploy doesn't include; a whole-repository read, so only for the Push step. */
export async function changesOutside(projectPath: string, facts: SourceFacts): Promise<string[]> {
    return facts.root && facts.appPath && facts.appPath !== "/" ? (await statusEntries(projectPath, [":/", ":!."])).map(({ file }) => file) : [];
}

export async function inspectSource(projectPath: string, facts: SourceFacts, prep: Preparation, otherChanges?: string[]): Promise<AgentManagerSource> {
    return {
        repository: facts.repository,
        branch: facts.upstreamBranch ?? facts.branch,
        remoteCommit: facts.remoteCommit,
        isPrivate: facts.repository ? await isPrivateRepo(facts.repository) : undefined,
        step: (await sourceSteps(projectPath, facts, prep)).find((step): step is AgentManagerSourceStep => !!step),
        blocker: pushBlocker(facts),
        changedFiles: facts.dirty,
        otherChanges,
        changedConfigs: facts.changedConfigs,
        ...await localOnlyNotes(projectPath, prep.exposedFiles),
        unpushedCommits: facts.ahead,
        missingOnRemote: facts.missingOnRemote,
        preparation: await preparationState(projectPath, prep),
    };
}

// Deploys build the upstream commit, so the files preparing added count only once that commit has them.
export async function preparationState(projectPath: string, prep: Preparation): Promise<NonNullable<AgentManagerSource["preparation"]>> {
    const inUpstream = await Promise.all(prep.buildFiles.map(async (file) => (await git(projectPath, ["cat-file", "-e", `@{u}:./${file}`])).status === 0));
    return { openApiSpec: prep.openApiSpec, gitignore: prep.gitignore || prep.exposedFiles.length > 0, ampImport: prep.ampImport, unpushed: inUpstream.includes(false) };
}

export async function ensureGitIgnored(projectPath: string, file: string): Promise<boolean> {
    if ((await git(projectPath, ["check-ignore", "-q", "--no-index", file])).status !== 1) {
        return false;
    }
    const gitignorePath = path.join(projectPath, ".gitignore");
    const eol = fs.existsSync(gitignorePath) ? detectEol(fs.readFileSync(gitignorePath, "utf-8")) : "\n";
    fs.appendFileSync(gitignorePath, `${eol}${file}${eol}`);
    return true;
}

/** Exposed local-only files by whether Git tracks them: Commit and Push removes the tracked ones from Git and ignores both. */
export async function localOnlyNotes(projectPath: string, exposed: string[]): Promise<{ keptOut: string[]; removedFromGit: string[] }> {
    const tracked = exposed.length > 0 ? await git(projectPath, ["ls-files", "--", ...exposed]) : undefined;
    const removedFromGit = tracked?.status === 0 ? tracked.stdout.split("\n").filter(Boolean) : [];
    return { keptOut: exposed.filter((file) => !removedFromGit.includes(file)), removedFromGit };
}

export async function untrack(projectPath: string, file: string): Promise<void> {
    if ((await git(projectPath, ["ls-files", "--error-unmatch", file])).status !== 0) {
        return;
    }
    // `-f`: a staged edit that differs from the file on disk would otherwise refuse the removal and leave the file tracked.
    const removed = await git(projectPath, ["rm", "--cached", "-f", "-q", file]);
    if (removed.status !== 0) {
        throw new Error(`Couldn't remove ${file} from Git: ${(removed.stderr || removed.stdout).trim()}`);
    }
}

export const remoteRepository = async (projectPath: string, remote: string) =>
    (await githubRemotes(projectPath)).find((candidate) => candidate.name === remote)?.repository;

export async function githubRemotes(projectPath: string): Promise<AgentManagerRemote[]> {
    const lines = ((await out(projectPath, ["remote", "-v"])) ?? "").split("\n").filter((line) => line.endsWith("(fetch)"));
    return lines.flatMap((line) => {
        const [name, url] = line.split(/\s+/);
        const repository = repoFromUrl(url);
        return repository ? [{ name, repository }] : [];
    });
}

// The branch's tracked remote and branch have what was pushed; without one, a fork usually builds from its parent, `upstream`.
export async function defaultSource(projectPath: string, remotes: AgentManagerRemote[]): Promise<{ remote?: string; branch?: string }> {
    const facts = await readFacts(projectPath);
    const tracked = facts.upstreamBranch && remotes.find((remote) => remote.name === facts.remoteName);
    if (tracked) {
        return { remote: tracked.name, branch: facts.upstreamBranch };
    }
    return { remote: (remotes.find((remote) => remote.name === "upstream") ?? remotes[0])?.name };
}

export async function repoDetails(projectPath: string, remote: string): Promise<AgentManagerRepoDetails> {
    const repository = await remoteRepository(projectPath, remote);
    if (!repository) {
        return { branches: [], error: `'${remote}' isn't a GitHub remote of this repository.` };
    }
    // "--" keeps a remote name that starts with "-" from being read as a git option.
    const heads = await git(projectPath, ["ls-remote", "--symref", "--", remote, "HEAD", "refs/heads/*"]);
    if (heads.status !== 0) {
        return { branches: [], error: `Couldn't list the branches of ${repository}: ${heads.stderr.trim().split("\n").pop()}` };
    }
    const lines = heads.stdout.split("\n");
    const defaultBranch = lines.find((line) => line.startsWith("ref: "))?.match(/refs\/heads\/(\S+)\s+HEAD/)?.[1];
    const branches = lines.flatMap((line) => line.match(/\trefs\/heads\/(.+)$/)?.[1] ?? []);
    return { branches, defaultBranch, isPrivate: await isPrivateRepo(repository) };
}

export async function checkPushed(projectPath: string, remote: string, branch: string, appPath: string, buildFiles: string[]): Promise<AgentManagerSourceCheck> {
    const repository = await remoteRepository(projectPath, remote);
    if (!repository) {
        return { ok: false, message: `'${remote}' isn't a GitHub remote of this repository.` };
    }
    const dir = appPath.replace(/^\/+|\/+$/g, "");
    const missing = await missingOnBranch(projectPath, { name: remote, branch }, dir, ["Ballerina.toml", ...buildFiles]);
    if (!missing) {
        return { ok: false, message: `Couldn't fetch ${branch} from ${repository}.` };
    }
    const where = `${repository} · ${branch}`;
    if (missing.includes("Ballerina.toml")) {
        const found = await locatePackage(projectPath, { name: remote, repository, branch }, dir);
        return { ok: false, message: `Project not found on ${where}. ${found ? foundHint(found, repository, branch) : "Push the project to this branch."}` };
    }
    if (missing.length > 0) {
        return { ok: false, message: `${missing.join(" and ")} not found on ${where}. Push the project to this branch.` };
    }
    return { ok: true, message: `Found on ${where}.` };
}

interface RemoteBranch {
    name: string;
    branch: string;
}

// The files of `dir` that the remote's branch lacks, or undefined when the branch can't be fetched.
async function missingOnBranch(projectPath: string, { name: remote, branch }: RemoteBranch, dir: string, files: string[], timeout?: number): Promise<string[] | undefined> {
    const fetched = await git(projectPath, ["fetch", "--quiet", "--", remote, `refs/heads/${branch}:refs/remotes/${remote}/${branch}`], timeout);
    if (fetched.status !== 0) {
        return undefined;
    }
    const present = await Promise.all(files.map(async (file) =>
        (await git(projectPath, ["cat-file", "-e", `refs/remotes/${remote}/${branch}:${dir ? `${dir}/` : ""}${file}`])).status === 0));
    return files.filter((_, index) => !present[index]);
}

const ELSEWHERE_TIMEOUT_MS = 10_000;

// The branch's tracked branch first, then the same branch on each other repository; fetched together so one slow remote can't stall the rest.
async function locatePackage(projectPath: string, checked: RemoteBranch & { repository: string }, dir: string): Promise<{ repository: string; branch: string } | undefined> {
    const facts = await readFacts(projectPath);
    const sameRepo = (repository: string) => repository.toLowerCase() === checked.repository.toLowerCase();
    const tracked = facts.remoteName && facts.repository && facts.upstreamBranch
        && !(sameRepo(facts.repository) && facts.upstreamBranch === checked.branch)
        ? [{ name: facts.remoteName, repository: facts.repository, branch: facts.upstreamBranch }] : [];
    const others = new Map((await githubRemotes(projectPath))
        .filter(({ repository }) => !sameRepo(repository))
        .map(({ name, repository }) => [repository.toLowerCase(), { name, repository, branch: checked.branch }]));
    const candidates = [...tracked, ...others.values()];
    const found = await Promise.all(candidates.map(async (candidate) =>
        (await missingOnBranch(projectPath, candidate, dir, ["Ballerina.toml"], ELSEWHERE_TIMEOUT_MS))?.length === 0));
    return candidates.find((_, index) => found[index]);
}

function foundHint(found: { repository: string; branch: string }, repository: string, branch: string): string {
    const changed = [found.repository.toLowerCase() !== repository.toLowerCase() && "repository", found.branch !== branch && "branch"].filter(Boolean);
    return `It is on ${found.repository} · ${found.branch}. Select that ${changed.join(" and ")}.`;
}

const sameRepo = (url: string | undefined, repository: string) => repoFromUrl(url)?.toLowerCase() === repository.toLowerCase();
const samePath = (a = "/", b = "/") => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

export async function linkCandidates(projectPath: string): Promise<AgentManagerLinkCandidate[]> {
    const remotes = await githubRemotes(projectPath);
    if (remotes.length === 0) {
        return [];
    }
    const appPath = (await readFacts(projectPath)).appPath;
    const projects = await api.listProjects();
    const perProject = await Promise.all(projects.map(async (project) => (await api.listAgents(project.name)).flatMap((agent) => {
        const repo = agent.provisioning.repository;
        const remote = remotes.find((candidate) => sameRepo(repo?.url, candidate.repository));
        return agent.provisioning.type === "internal" && remote && samePath(repo?.appPath, appPath)
            ? [{ project: project.name, agent: agent.name, displayName: agent.displayName ?? agent.name, repository: remote.repository, branch: repo?.branch }]
            : [];
    })));
    return perProject.flat();
}

const BRANCH_FETCH_TTL_MS = 60 * 1000;
const branchFetchedAt = new Map<string, number>();

export async function buildBranch(projectPath: string, repoUrl: string | undefined, branch: string | undefined) {
    const repository = repoFromUrl(repoUrl);
    if (!repository || !branch) {
        return undefined;
    }
    const remote = (await githubRemotes(projectPath)).find((candidate) => sameRepo(repoUrl, candidate.repository))?.name;
    const ref = `refs/remotes/${remote}/${branch}`;
    if (remote && Date.now() - (branchFetchedAt.get(projectPath + ref) ?? 0) > BRANCH_FETCH_TTL_MS) {
        await git(projectPath, ["fetch", "--quiet", "--", remote, `refs/heads/${branch}:${ref}`]);
        branchFetchedAt.set(projectPath + ref, Date.now());
    }
    const tip = remote ? await out(projectPath, ["rev-parse", "--verify", "--quiet", ref]) : undefined;
    return { repository, tip, message: tip && await out(projectPath, ["log", "-1", "--format=%s", tip]) };
}
