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

// Opening a sample from a vscode://wso2.ballerina/open-file or /open-repo link: the URI routing, and
// the checks on where a file or repository may come from. Network and editor calls are mocked; the
// download is written to a temp directory.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";

jest.mock("vscode", () => {
    const actual = jest.requireActual("vscode");
    return {
        ...actual,
        StatusBarAlignment: { Left: 1, Right: 2 },
        Selection: class {},
        languages: {},
        window: {
            ...actual.window,
            createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
            // The real API passes a cancellation token too.
            withProgress: (_options: unknown, task: (progress: unknown, token: unknown) => unknown) =>
                task({ report() {} }, { onCancellationRequested() {} }),
            registerUriHandler: jest.fn(),
            showOpenDialog: jest.fn(),
            showErrorMessage: jest.fn(),
            showInformationMessage: jest.fn(),
        },
        workspace: { ...actual.workspace, openTextDocument: jest.fn(() => Promise.resolve({})), getConfiguration: jest.fn() },
        commands: { ...actual.commands, executeCommand: jest.fn(() => Promise.resolve(undefined)) },
    };
});
jest.mock("axios");
// preferences.ts has no imports, so the real settings key loads without the rest of core.
jest.mock("../core", () => ({ FILE_DOWNLOAD_PATH: jest.requireActual("../core/preferences").FILE_DOWNLOAD_PATH, BallerinaExtension: class {} }));
jest.mock("../features/telemetry", () => ({ sendTelemetryEvent: jest.fn() }));
jest.mock("../utils/config", () => ({ checkIsBallerinaPackage: jest.fn() }));
// uri-handlers.ts imports the handlers through the utils index; the routing tests check the calls.
jest.mock("../utils", () => ({ handleOpenFile: jest.fn(), handleOpenRepo: jest.fn() }));
// Only its command IDs are read, inside handlers these tests do not call.
jest.mock("@wso2/wso2-platform-core", () => ({ WICommandIds: {} }));

import axios from "axios";
import { commands, ConfigurationTarget, window, workspace } from "vscode";
import type { BallerinaExtension } from "../core";
import { handleOpenFile as routedOpenFile, handleOpenRepo as routedOpenRepo } from "../utils";
import { activateUriHandlers } from "../utils/uri-handlers";
import { handleOpenFile, handleOpenRepo } from "../utils/file-utils";

const mockedAxiosGet = axios.get as jest.Mock;
const showError = window.showErrorMessage as jest.Mock;
const showInfo = window.showInformationMessage as jest.Mock;
const executeCommand = commands.executeCommand as jest.Mock;
const showOpenDialog = window.showOpenDialog as jest.Mock;
const getConfiguration = workspace.getConfiguration as jest.Mock;
const configUpdate = jest.fn(() => Promise.resolve());

// handleOpenRepo starts cloneRepo and openRepoInVSCode without awaiting them. Let them finish
// before asserting on what they do.
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Picks the button with this title from a showInformationMessage call.
const pick = (title: string) => (_message: string, ...rest: unknown[]) =>
    Promise.resolve(rest.find((item) => (item as { title?: string })?.title === title));

// The parts of BallerinaExtension the handlers use.
type FakeExtension = {
    getFileDownloadPath(): string;
    context: { globalState: { get(key: string): unknown; update(key: string, value: unknown): void } };
};

function makeExtension(downloadPath: string): FakeExtension {
    const state = new Map<string, unknown>();
    return {
        getFileDownloadPath: () => downloadPath,
        context: { globalState: { get: (k) => state.get(k), update: (k, v) => { state.set(k, v); } } },
    };
}

const asExtension = (fake: FakeExtension) => fake as unknown as BallerinaExtension;

let tmp: string;
beforeEach(() => {
    jest.clearAllMocks();
    mockedAxiosGet.mockReset();
    showInfo.mockReset();
    getConfiguration.mockReturnValue({ update: configUpdate });
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "open-from-url-"));
});
afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe("URI routing", () => {
    function handle(uri: string, ext = makeExtension(tmp)) {
        activateUriHandlers(asExtension(ext));
        const { handleUri } = (window.registerUriHandler as jest.Mock).mock.calls[0][0];
        const url = new URL(uri);
        handleUri({ path: url.pathname, query: url.search.slice(1) });
        return ext;
    }

    it("routes /open-file with a gist and file name", () => {
        const ext = handle("vscode://wso2.ballerina/open-file?gist=abc123&file=hello.bal");
        expect(routedOpenFile).toHaveBeenCalledWith(ext, "abc123", "hello.bal", null);
    });

    it("routes /open-file with a repository file URL", () => {
        const fileUrl = "https://github.com/wso2/samples/blob/main/hello.bal";
        const ext = handle(`vscode://wso2.ballerina/open-file?repoFileUrl=${fileUrl}`);
        expect(routedOpenFile).toHaveBeenCalledWith(ext, null, null, fileUrl);
    });

    it("rejects /open-file with neither a gist nor a repository file URL", () => {
        handle("vscode://wso2.ballerina/open-file?file=hello.bal");
        expect(routedOpenFile).not.toHaveBeenCalled();
        expect(showError).toHaveBeenCalledWith("Gist or the file not found!");
    });

    it("routes /open-repo with the file to open after cloning", () => {
        const ext = handle("vscode://wso2.ballerina/open-repo?repoUrl=https://github.com/wso2/samples&openFile=a/b.bal");
        expect(routedOpenRepo).toHaveBeenCalledWith(ext, "https://github.com/wso2/samples", "a/b.bal");
    });

    it("rejects /open-repo without a repository URL", () => {
        handle("vscode://wso2.ballerina/open-repo?openFile=a/b.bal");
        expect(routedOpenRepo).not.toHaveBeenCalled();
        expect(showError).toHaveBeenCalledWith("Repository url not found!");
    });
});

describe("open-file", () => {
    function serveFile(content: string) {
        return { data: Readable.from([content]) };
    }

    it("downloads a gist file published by the Ballerina bot and offers to open it", async () => {
        mockedAxiosGet.mockImplementation((url: string) => url === "https://api.github.com/gists/abc123"
            ? Promise.resolve({ data: { owner: { login: "ballerina-github-bot" }, files: { "hello.bal": { raw_url: "https://raw/hello.bal" } } } })
            : Promise.resolve(serveFile("public function main() {}\n")));

        await handleOpenFile(asExtension(makeExtension(tmp)), "abc123", "hello.bal");

        expect(mockedAxiosGet).toHaveBeenCalledWith("https://raw/hello.bal", expect.objectContaining({ responseType: "stream" }));
        expect(fs.readFileSync(path.join(tmp, "hello.bal"), "utf8")).toBe("public function main() {}\n");
        expect(showInfo).toHaveBeenCalledWith("Would you like to open the downloaded file?", { modal: true }, expect.anything(), expect.anything());
        expect(showError).not.toHaveBeenCalled();
    });

    it("saves the folder picked with Change Directory as the download folder", async () => {
        mockedAxiosGet.mockResolvedValue(serveFile("service / on new http:Listener(9090) {}\n"));
        showInfo.mockImplementation((message: string, ...rest: unknown[]) =>
            message.startsWith("The Ballerina sample file has been downloaded") ? pick("Change Directory")(message, ...rest) : Promise.resolve(undefined));
        const picked = path.join(tmp, "picked");
        showOpenDialog.mockResolvedValue([{ fsPath: picked }]);

        await handleOpenFile(asExtension(makeExtension(tmp)), null, null, "https://github.com/wso2/samples/blob/main/greeter/service.bal");

        expect(configUpdate).toHaveBeenCalledWith("ballerina.samplesDownloadDirectory", picked, ConfigurationTarget.Global);
    });

    it("refuses a gist from any other owner", async () => {
        mockedAxiosGet.mockResolvedValue({ data: { owner: { login: "someone-else" }, files: { "hello.bal": { raw_url: "https://raw/hello.bal" } } } });

        await handleOpenFile(asExtension(makeExtension(tmp)), "abc123", "hello.bal");

        expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
        expect(fs.existsSync(path.join(tmp, "hello.bal"))).toBe(false);
        expect(showError).toHaveBeenCalledWith("File url is not valid.");
    });

    it("downloads a GitHub file from an allowed org through raw.githubusercontent.com", async () => {
        mockedAxiosGet.mockResolvedValue(serveFile("service / on new http:Listener(9090) {}\n"));

        await handleOpenFile(asExtension(makeExtension(tmp)), null, null, "https://github.com/wso2/samples/blob/main/greeter/service.bal");

        expect(mockedAxiosGet).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/wso2/samples/main/greeter/service.bal", expect.anything());
        expect(fs.existsSync(path.join(tmp, "service.bal"))).toBe(true);
    });

    it.each([
        ["an org outside the allowed list", "https://github.com/jclark/semtype/blob/master/main.bal"],
        ["a host other than github.com", "https://example.com/wso2/samples/blob/main/main.bal"],
    ])("refuses a file from %s", async (_case, fileUrl) => {
        await handleOpenFile(asExtension(makeExtension(tmp)), null, null, fileUrl);

        expect(mockedAxiosGet).not.toHaveBeenCalled();
        expect(showError).toHaveBeenCalledWith("File url is not valid.");
    });

    it("refuses a file that is not a .bal file", async () => {
        await handleOpenFile(asExtension(makeExtension(tmp)), null, null, "https://github.com/wso2/samples/blob/main/README.md");

        expect(mockedAxiosGet).not.toHaveBeenCalled();
        expect(showError).toHaveBeenCalledWith("Not a ballerina file.");
    });
});

describe("open-repo", () => {
    const repoUrl = "https://github.com/wso2/choreo-sample-apps";

    it("clones a repository from an allowed org when the user picks Clone Now", async () => {
        showInfo.mockImplementation(pick("Clone Now"));
        const ext = makeExtension(tmp);

        await handleOpenRepo(asExtension(ext), repoUrl, "ballerina/greeter/service.bal");
        await flush();

        expect(executeCommand).toHaveBeenCalledWith("git.clone", repoUrl, tmp);
        expect(ext.context.globalState.get("next-starting-up-file"))
            .toBe(path.join(tmp, "choreo-sample-apps", "ballerina/greeter/service.bal"));
    });

    it("clones into the folder picked with Change Directory, and saves it as the download folder", async () => {
        showInfo.mockImplementation(pick("Change Directory"));
        const picked = path.join(tmp, "picked");
        showOpenDialog.mockResolvedValue([{ fsPath: picked }]);

        await handleOpenRepo(asExtension(makeExtension(tmp)), repoUrl);
        await flush();

        expect(configUpdate).toHaveBeenCalledWith("ballerina.samplesDownloadDirectory", picked, ConfigurationTarget.Global);
        expect(executeCommand).toHaveBeenCalledWith("git.clone", repoUrl, picked);
    });

    // Clones once, so the repository location is recorded, then creates the clone's folder.
    async function cloneOnce(ext: FakeExtension) {
        showInfo.mockImplementation(pick("Clone Now"));
        await handleOpenRepo(asExtension(ext), repoUrl);
        await flush();
        fs.mkdirSync(path.join(tmp, "choreo-sample-apps"));
        executeCommand.mockClear();
        showInfo.mockReset().mockImplementation((_message: string, _options: unknown, open: unknown) => Promise.resolve(open));
    }

    it("opens an already cloned repository instead of cloning it again", async () => {
        const ext = makeExtension(tmp);
        await cloneOnce(ext);

        await handleOpenRepo(asExtension(ext), repoUrl);
        await flush();

        expect(showInfo).toHaveBeenCalledWith(
            "Repository already exists. Would you like to open the existing repository folder?", { modal: true }, expect.anything(), expect.anything());
        expect(executeCommand).not.toHaveBeenCalledWith("git.clone", expect.anything(), expect.anything());
        expect(executeCommand).toHaveBeenCalledWith("vscode.openFolder", expect.objectContaining({ fsPath: path.join(tmp, "choreo-sample-apps") }));
    });

    it("opens the requested file in an already cloned repository", async () => {
        const ext = makeExtension(tmp);
        await cloneOnce(ext);

        await handleOpenRepo(asExtension(ext), repoUrl, "ballerina/greeter/service.bal");
        await flush();

        expect(ext.context.globalState.get("next-starting-up-file"))
            .toBe(path.join(tmp, "choreo-sample-apps", "ballerina/greeter/service.bal"));
        expect(executeCommand).toHaveBeenCalledWith("vscode.openFolder", expect.objectContaining({ fsPath: path.join(tmp, "choreo-sample-apps") }));
    });

    it.each([
        ["an org outside the allowed list", "https://github.com/jclark/semtype"],
        ["a host other than github.com", "https://example.com/wso2/samples"],
        ["a host that starts with github.com", "https://github.com.example.com/wso2/samples"],
        ["a scheme other than https", "http://github.com/wso2/samples"],
    ])("refuses a repository from %s", async (_case, url) => {
        await handleOpenRepo(asExtension(makeExtension(tmp)), url);

        expect(executeCommand).not.toHaveBeenCalled();
        expect(showError).toHaveBeenCalledWith("Unauthorized repository.");
    });

    it("does not clone when the user cancels", async () => {
        showInfo.mockResolvedValue(undefined);

        await handleOpenRepo(asExtension(makeExtension(tmp)), repoUrl);

        expect(executeCommand).not.toHaveBeenCalled();
        expect(showError).toHaveBeenCalledWith("Repository clone canceled.");
    });
});
