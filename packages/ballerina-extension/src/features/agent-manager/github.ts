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
import * as vscode from "vscode";
import { AgentManagerSource, AgentManagerSourceStep } from "@wso2/ballerina-core";
import { writeProjectFile } from "./client";

const GITHUB_REPO_URL = /^(?:https?:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;
const REPO_INFO_TTL_MS = 10 * 60 * 1000;
export const LOCAL_ONLY_FILES = ["Config.toml", "trace_enabled.bal"];

export type SourceStepId =
    | "gitMissing" | "prepare" | "publishRepo" | "nonGitHub" | "detached"
    | "commitFirst" | "publishBranch" | "commit" | "push" | "pull" | "moved" | "syncGitHub" | "refreshSpec";

export interface SourceFacts {
    root?: string;
    appPath?: string;
    remoteName?: string;
    repository?: string;
    branch?: string;
    upstreamBranch?: string;
    remoteCommit?: string;
    ahead: number;
    behind: number;
    dirty: number;
    hasRemotes: boolean;
    gitMissing: boolean;
}

export interface Preparation {
    ampImport: boolean;
    openApiSpec: boolean;
    exposedFiles: string[];
    gitignore: boolean;
    /** Local files the build needs from GitHub, such as openapi.yaml. */
    buildFiles: string[];
    staleSpec: boolean;
}

interface RepoInfo {
    fullName?: string;
    isPrivate?: boolean;
    fetchedAt: number;
}

const repoInfoCache = new Map<string, RepoInfo>();

export function git(cwd: string, args: string[]) {
    return cp.spawnSync("git", args, { cwd, encoding: "utf-8" });
}

function out(cwd: string, args: string[]): string | undefined {
    const result = git(cwd, args);
    return result.status === 0 ? result.stdout.trim() : undefined;
}

export function readFacts(projectPath: string): SourceFacts {
    const facts: SourceFacts = { ahead: 0, behind: 0, dirty: 0, hasRemotes: false, gitMissing: false };
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
    const match = chosen?.[1]?.match(GITHUB_REPO_URL);
    facts.remoteName = match ? chosen![0] : undefined;
    facts.repository = match ? `${match[1]}/${match[2]}` : undefined;
    const merge = facts.branch ? out(projectPath, ["config", "--get", `branch.${facts.branch}.merge`]) : undefined;
    facts.upstreamBranch = upstreamRemote && merge ? merge.replace(/^refs\/heads\//, "") : undefined;
    facts.remoteCommit = facts.upstreamBranch ? out(projectPath, ["rev-parse", "@{u}"]) : undefined;
    const [behind, ahead] = (out(projectPath, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]) ?? "0 0").split(/\s+/).map(Number);
    facts.ahead = ahead || 0;
    facts.behind = behind || 0;
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

// The unauthenticated API is enough to tell public from private and to spot a renamed repository.
async function repoInfo(repository: string): Promise<RepoInfo> {
    const cached = repoInfoCache.get(repository);
    if (cached && Date.now() - cached.fetchedAt < REPO_INFO_TTL_MS) {
        return cached;
    }
    let info: RepoInfo = { isPrivate: true, fetchedAt: Date.now() };
    try {
        const response = await fetch(`https://api.github.com/repos/${repository}`, { headers: { Accept: "application/vnd.github+json" } });
        if (response.ok) {
            const body = (await response.json()) as { full_name: string; private: boolean };
            info = { fullName: body.full_name, isPrivate: body.private, fetchedAt: Date.now() };
        }
    } catch {
        info = { fetchedAt: Date.now() };
    }
    repoInfoCache.set(repository, info);
    return info;
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function preparationStep(prep: Preparation): AgentManagerSourceStep | undefined {
    const files = [prep.ampImport && "agent_manager.bal", prep.openApiSpec && "openapi.yaml", prep.gitignore && ".gitignore"].filter(Boolean);
    if (files.length === 0 && prep.exposedFiles.length === 0) {
        return undefined;
    }
    const parts = [
        files.length > 0 && `Agent Manager needs ${files.join(", ")}`,
        prep.exposedFiles.length > 0 && `${prep.exposedFiles.join(" and ")} must stay out of Git`,
    ].filter(Boolean);
    return { id: "prepare", message: `${parts.join(". ")}.`, actionLabel: "Prepare Project", blocking: true };
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

type StepRule = [boolean, AgentManagerSourceStep];

function sourceSteps(projectPath: string, facts: SourceFacts, prep: Preparation, renamedTo?: string): StepRule[] {
    const onGitHub = !!facts.upstreamBranch;
    return [
        [facts.gitMissing, { id: "gitMissing", message: "Git isn't installed. It's needed to put this code on GitHub.", actionLabel: "Download Git", blocking: true }],
        [true, preparationStep(prep)!],
        [!facts.repository && !facts.hasRemotes, { id: "publishRepo", message: "Not on GitHub yet.", actionLabel: "Publish to GitHub", blocking: true }],
        [!facts.repository, { id: "nonGitHub", message: "This repository's remote isn't on GitHub. Agent Manager builds from GitHub only.", blocking: true }],
        [!facts.branch, { id: "detached", message: "Not on a branch.", actionLabel: "Check Out a Branch", blocking: true }],
        [!onGitHub && facts.dirty > 0, { id: "commitFirst", message: `${plural(facts.dirty, "change")} to commit before publishing.`, actionLabel: "Review and Commit", blocking: true }],
        [!onGitHub, { id: "publishBranch", message: `${facts.branch} isn't on GitHub yet.`, actionLabel: "Publish Branch", blocking: true }],
        [true, gitHubStep(projectPath, facts, prep)!],
        [!!renamedTo, { id: "moved", message: `This repository moved to ${renamedTo}.`, actionLabel: "Update Remote", blocking: false }],
        [prep.staleSpec, { id: "refreshSpec", message: "openapi.yaml no longer matches the service.", actionLabel: "Update API Spec", blocking: false }],
        [facts.dirty > 0, { id: "commit", message: `${plural(facts.dirty, "uncommitted change")} won't be deployed.`, actionLabel: "Review", blocking: false }],
        [facts.ahead > 0, { id: "push", message: `${plural(facts.ahead, "commit")} not pushed.`, actionLabel: "Push", blocking: false }],
        [facts.behind > 0, { id: "pull", message: `GitHub has ${plural(facts.behind, "newer commit")}.`, actionLabel: "Pull", blocking: false }],
    ];
}

export async function inspectSource(projectPath: string, prep: Preparation): Promise<AgentManagerSource & { facts: SourceFacts }> {
    const facts = readFacts(projectPath);
    const info = facts.repository ? await repoInfo(facts.repository) : undefined;
    const renamedTo = info?.fullName && info.fullName.toLowerCase() !== facts.repository!.toLowerCase() ? info.fullName : undefined;
    const step = sourceSteps(projectPath, facts, prep, renamedTo).find(([applies, candidate]) => applies && candidate)?.[1];
    return {
        facts,
        repository: facts.repository,
        branch: facts.upstreamBranch ?? facts.branch,
        remoteCommit: facts.remoteCommit,
        isPrivate: info?.isPrivate,
        step,
    };
}

export async function renameRemote(projectPath: string, facts: SourceFacts): Promise<void> {
    const info = await repoInfo(facts.repository!);
    git(projectPath, ["remote", "set-url", facts.remoteName!, `https://github.com/${info.fullName}.git`]);
    repoInfoCache.delete(facts.repository!);
}

export function ensureGitIgnored(projectPath: string, file: string): boolean {
    if (git(projectPath, ["check-ignore", "-q", "--no-index", file]).status !== 1) {
        return false;
    }
    writeProjectFile(projectPath, path.join(projectPath, ".gitignore"), `\n${file}\n`, true);
    return true;
}

export function untrack(projectPath: string, file: string): void {
    if (git(projectPath, ["ls-files", "--error-unmatch", file]).status === 0) {
        git(projectPath, ["rm", "--cached", "-q", file]);
    }
}

interface GitApiRepository {
    rootUri: vscode.Uri;
    inputBox: { value: string };
}

// Prefills the Source Control commit box; the user reviews and commits there.
export async function openCommitView(projectPath: string, message: string): Promise<void> {
    const gitExtension = vscode.extensions.getExtension("vscode.git");
    const api = gitExtension && (gitExtension.isActive ? gitExtension.exports : await gitExtension.activate()).getAPI(1);
    const repo: GitApiRepository | null | undefined = api?.getRepository(vscode.Uri.file(projectPath));
    if (repo && !repo.inputBox.value) {
        repo.inputBox.value = message;
    }
    await vscode.commands.executeCommand("workbench.view.scm");
}

export function suggestCommitMessage(projectPath: string): string {
    const labels: Record<string, string> = {
        "agent_manager.bal": "Add Agent Manager tracing",
        "openapi.yaml": "Add OpenAPI spec for Agent Manager",
        ".gitignore": "Keep local config out of Git",
    };
    const changed = changedFiles(projectPath).map((file) => path.basename(file));
    if (!out(projectPath, ["rev-parse", "HEAD"])) {
        return "Initial commit";
    }
    const known = [...new Set(changed.map((file) => labels[file]).filter(Boolean))];
    const others = changed.filter((file) => !labels[file] && !LOCAL_ONLY_FILES.includes(file));
    const parts = [...known, ...(others.length > 3 ? [`Update ${others.length} files`] : others.length ? [`Update ${others.join(", ")}`] : [])];
    return parts.join("; ") || "Update agent";
}
