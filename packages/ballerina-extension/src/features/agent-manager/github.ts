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
import { api } from "./client";

const GITHUB_REPO_URL = /^(?:https?:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;
const REPO_INFO_TTL_MS = 10 * 60 * 1000;
export const LOCAL_ONLY_FILES = ["Config.toml", "trace_enabled.bal"];

export type SourceStepId =
    | "gitMissing" | "prepare" | "publishRepo" | "nonGitHub" | "detached"
    | "commitFirst" | "publishBranch" | "commit" | "push" | "syncGitHub" | "refreshSpec";

interface SourceFacts {
    root?: string;
    appPath?: string;
    remoteName?: string;
    repository?: string;
    branch?: string;
    upstreamBranch?: string;
    remoteCommit?: string;
    ahead: number;
    dirty: number;
    hasRemotes: boolean;
    gitMissing: boolean;
}

export interface Preparation {
    openApiSpec: boolean;
    ampImport: boolean;
    exposedFiles: string[];
    gitignore: boolean;
    buildFiles: string[];
    staleSpec: boolean;
}

const repoInfoCache = new Map<string, { isPrivate?: boolean; at: number }>();

export function git(cwd: string, args: string[]) {
    return cp.spawnSync("git", args, { cwd, encoding: "utf-8" });
}

function out(cwd: string, args: string[]): string | undefined {
    const result = git(cwd, args);
    return result.status === 0 ? result.stdout.trim() : undefined;
}

const repoFromUrl = (url?: string) => url?.match(GITHUB_REPO_URL)?.slice(1, 3).join("/");

export function readFacts(projectPath: string): SourceFacts {
    const facts: SourceFacts = { ahead: 0, dirty: 0, hasRemotes: false, gitMissing: false };
    if (git(projectPath, ["--version"]).error) {
        return { ...facts, gitMissing: true };
    }
    facts.root = out(projectPath, ["rev-parse", "--show-toplevel"]);
    if (!facts.root) {
        return facts;
    }
    // Git's own prefix avoids path.relative, which breaks when the folder's case differs from what's on disk.
    facts.appPath = "/" + (out(projectPath, ["rev-parse", "--show-prefix"]) ?? "").replace(/\/$/, "");
    const remotes = (out(projectPath, ["remote", "-v"]) ?? "").split("\n").filter(Boolean).map((line) => line.split(/\s+/));
    facts.hasRemotes = remotes.length > 0;
    facts.branch = out(projectPath, ["symbolic-ref", "-q", "--short", "HEAD"]);
    // The repository must be the one the branch pushes to, or builds would use a different remote's code.
    const upstreamRemote = facts.branch ? out(projectPath, ["config", "--get", `branch.${facts.branch}.remote`]) : undefined;
    const chosen = upstreamRemote
        ? remotes.find(([name]) => name === upstreamRemote)
        : remotes.find(([, url]) => GITHUB_REPO_URL.test(url ?? ""));
    facts.repository = repoFromUrl(chosen?.[1]);
    facts.remoteName = facts.repository && chosen![0];
    const merge = facts.branch ? out(projectPath, ["config", "--get", `branch.${facts.branch}.merge`]) : undefined;
    facts.upstreamBranch = upstreamRemote && merge ? merge.replace(/^refs\/heads\//, "") : undefined;
    facts.remoteCommit = facts.upstreamBranch ? out(projectPath, ["rev-parse", "@{u}"]) : undefined;
    facts.ahead = Number(out(projectPath, ["rev-list", "--count", "@{u}..HEAD"])) || 0;
    facts.dirty = changedFiles(projectPath).length;
    return facts;
}

// Only this package's folder counts: in a workspace, other packages' changes don't reach this agent's build.
function changedFiles(packagePath: string): string[] {
    return (out(packagePath, ["status", "--porcelain", "-uall", "--", "."]) ?? "")
        .split("\n").filter(Boolean).map((line) => line.slice(3).trim());
}

export function isExposed(projectPath: string, file: string, inRepo: boolean): boolean {
    if (!fs.existsSync(path.join(projectPath, file))) {
        return false;
    }
    return inRepo ? git(projectPath, ["check-ignore", "-q", file]).status !== 0 : !listedInGitignore(projectPath, file);
}

export function isIgnored(projectPath: string, entry: string, inRepo: boolean): boolean {
    return inRepo ? git(projectPath, ["check-ignore", "-q", "--no-index", entry]).status === 0 : listedInGitignore(projectPath, entry);
}

function listedInGitignore(projectPath: string, entry: string): boolean {
    const gitignore = path.join(projectPath, ".gitignore");
    const lines = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf-8").split("\n").map((line) => line.trim()) : [];
    return lines.includes(entry) || lines.includes(`/${entry}`);
}

// The unauthenticated API 404s for private repositories, so a failed lookup reads as private.
async function isPrivateRepo(repository: string): Promise<boolean | undefined> {
    const cached = repoInfoCache.get(repository);
    if (cached && Date.now() - cached.at < REPO_INFO_TTL_MS) {
        return cached.isPrivate;
    }
    let isPrivate: boolean | undefined = true;
    try {
        const response = await fetch(`https://api.github.com/repos/${repository}`, { headers: { Accept: "application/vnd.github+json" } });
        if (response.ok) {
            isPrivate = ((await response.json()) as { private: boolean }).private;
        }
    } catch {
        isPrivate = undefined;
    }
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
function gitHubStep(projectPath: string, facts: SourceFacts, prep: Preparation): AgentManagerSourceStep | undefined {
    const commit = facts.remoteCommit;
    const inCommit = (file: string) => !!commit && git(projectPath, ["cat-file", "-e", `${commit}:./${file}`]).status === 0;
    const missing = prep.buildFiles.filter((file) => !inCommit(file));
    const leaked = LOCAL_ONLY_FILES.filter(inCommit);
    if (!commit || (missing.length === 0 && leaked.length === 0)) {
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

function sourceSteps(projectPath: string, facts: SourceFacts, prep: Preparation): (AgentManagerSourceStep | false | undefined)[] {
    const onGitHub = !!facts.upstreamBranch;
    return [
        facts.gitMissing && { id: "gitMissing", message: "Git isn't installed. It's needed to put this code on GitHub.", actionLabel: "Download Git", blocking: true },
        preparationStep(prep),
        !facts.repository && !facts.hasRemotes && { id: "publishRepo", message: "Not on GitHub yet.", actionLabel: "Publish to GitHub", blocking: true },
        !facts.repository && { id: "nonGitHub", message: "This repository's remote isn't on GitHub. Agent Manager builds from GitHub only.", blocking: true },
        !facts.branch && { id: "detached", message: "Not on a branch.", actionLabel: "Check Out a Branch", blocking: true },
        !onGitHub && facts.dirty > 0 && { id: "commitFirst", message: `${facts.dirty} ${facts.dirty === 1 ? "change" : "changes"} to commit before publishing.`, actionLabel: "Review and Commit", blocking: true },
        !onGitHub && { id: "publishBranch", message: `${facts.branch} isn't on GitHub yet.`, actionLabel: "Publish Branch", blocking: true },
        gitHubStep(projectPath, facts, prep),
        prep.staleSpec && { id: "refreshSpec", message: "openapi.yaml no longer matches the service.", actionLabel: "Update API Spec", blocking: false },
        facts.dirty > 0 && { id: "commit", message: NOT_ON_GITHUB, actionLabel: "Review and Commit", blocking: false },
        facts.ahead > 0 && { id: "push", message: NOT_ON_GITHUB, actionLabel: "Push", blocking: false },
    ];
}

export async function inspectSource(projectPath: string, prep: Preparation): Promise<AgentManagerSource> {
    const facts = readFacts(projectPath);
    return {
        repository: facts.repository,
        branch: facts.upstreamBranch ?? facts.branch,
        remoteCommit: facts.remoteCommit,
        isPrivate: facts.repository ? await isPrivateRepo(facts.repository) : undefined,
        step: sourceSteps(projectPath, facts, prep).find((step): step is AgentManagerSourceStep => !!step),
    };
}

export function ensureGitIgnored(projectPath: string, file: string): boolean {
    if (git(projectPath, ["check-ignore", "-q", "--no-index", file]).status !== 1) {
        return false;
    }
    fs.appendFileSync(path.join(projectPath, ".gitignore"), `\n${file}\n`);
    return true;
}

export function untrack(projectPath: string, file: string): void {
    if (git(projectPath, ["ls-files", "--error-unmatch", file]).status === 0) {
        git(projectPath, ["rm", "--cached", "-q", file]);
    }
}

export const remoteRepository = (projectPath: string, remote: string) =>
    githubRemotes(projectPath).find((candidate) => candidate.name === remote)?.repository;

export function githubRemotes(projectPath: string): AgentManagerRemote[] {
    const lines = (out(projectPath, ["remote", "-v"]) ?? "").split("\n").filter((line) => line.endsWith("(fetch)"));
    return lines.flatMap((line) => {
        const [name, url] = line.split(/\s+/);
        const repository = repoFromUrl(url);
        return repository ? [{ name, repository }] : [];
    });
}

// A fork usually builds from its parent, which git conventionally names `upstream`.
export function defaultRemote(projectPath: string, remotes: AgentManagerRemote[]): string | undefined {
    const tracked = readFacts(projectPath).remoteName;
    return (remotes.find((remote) => remote.name === "upstream") ?? remotes.find((remote) => remote.name === tracked) ?? remotes[0])?.name;
}

// Network git calls run async and never prompt, so a missing credential fails instead of hanging the extension host.
function gitAsync(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        cp.execFile("git", args, { cwd, timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
            (error, stdout, stderr) => resolve({ ok: !error, stdout: String(stdout), stderr: String(stderr) }));
    });
}

export async function repoDetails(projectPath: string, remote: string): Promise<AgentManagerRepoDetails> {
    const repository = remoteRepository(projectPath, remote);
    const heads = await gitAsync(projectPath, ["ls-remote", "--symref", remote, "HEAD", "refs/heads/*"]);
    if (!heads.ok) {
        return { branches: [], error: `Couldn't list the branches of ${repository ?? remote}: ${heads.stderr.trim().split("\n").pop()}` };
    }
    const lines = heads.stdout.split("\n");
    const defaultBranch = lines.find((line) => line.startsWith("ref: "))?.match(/refs\/heads\/(\S+)\s+HEAD/)?.[1];
    const branches = lines.flatMap((line) => line.match(/\trefs\/heads\/(.+)$/)?.[1] ?? []);
    return { branches, defaultBranch, isPrivate: repository ? await isPrivateRepo(repository) : undefined };
}

export async function checkPushed(projectPath: string, remote: string, branch: string, appPath: string, buildFiles: string[]): Promise<AgentManagerSourceCheck> {
    const repository = remoteRepository(projectPath, remote) ?? remote;
    const fetched = await gitAsync(projectPath, ["fetch", "--quiet", remote, `refs/heads/${branch}:refs/remotes/${remote}/${branch}`]);
    if (!fetched.ok) {
        return { ok: false, message: `Couldn't fetch ${branch} from ${repository}.` };
    }
    const dir = appPath.replace(/^\/+|\/+$/g, "");
    const onBranch = (file: string) => git(projectPath, ["cat-file", "-e", `refs/remotes/${remote}/${branch}:${dir ? `${dir}/` : ""}${file}`]).status === 0;
    if (!onBranch("Ballerina.toml")) {
        return { ok: false, message: `Not found on ${branch}. Push your changes first.` };
    }
    const missing = buildFiles.filter((file) => !onBranch(file));
    if (missing.length > 0) {
        return { ok: false, message: `${missing.join(" and ")} not found on ${branch}. Push your changes first.` };
    }
    return { ok: true, message: `Found on ${branch}.` };
}

const sameRepo = (url: string | undefined, repository: string) => repoFromUrl(url)?.toLowerCase() === repository.toLowerCase();
const samePath = (a = "/", b = "/") => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

export async function linkCandidates(projectPath: string): Promise<AgentManagerLinkCandidate[]> {
    const remotes = githubRemotes(projectPath);
    const appPath = readFacts(projectPath).appPath;
    if (remotes.length === 0) {
        return [];
    }
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
    const remote = githubRemotes(projectPath).find((candidate) => sameRepo(repoUrl, candidate.repository))?.name;
    const ref = `refs/remotes/${remote}/${branch}`;
    if (remote && Date.now() - (branchFetchedAt.get(projectPath + ref) ?? 0) > BRANCH_FETCH_TTL_MS) {
        await gitAsync(projectPath, ["fetch", "--quiet", remote, `refs/heads/${branch}:${ref}`]);
        branchFetchedAt.set(projectPath + ref, Date.now());
    }
    const tip = remote ? out(projectPath, ["rev-parse", "--verify", "--quiet", ref]) : undefined;
    return { repository, tip, message: tip && out(projectPath, ["log", "-1", "--format=%s", tip]) };
}
