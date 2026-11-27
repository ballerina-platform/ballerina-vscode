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

// L1: what each platform's manager does with an answer that arrives after WSO2 Integrator switched platform,
// and what Devant's does with a call that fails.

let cloudPlatform: string | undefined;

jest.mock("../utils/cloud-auth", () => ({
    getCloudPlatform: () => cloudPlatform,
    getPlatformGate: async (): Promise<undefined> => undefined,
    onDidChangeCloudSessions: () => ({ dispose: () => undefined }),
}));
jest.mock("../stateMachine", () => ({ StateMachine: { context: () => ({}) } }));
/** What the workspace holds for the store; a case replaces it to fail a read. */
let mockStored: () => string | undefined = () => undefined;
jest.mock("../BalExtensionContext", () => ({
    extension: { context: { workspaceState: { get: () => mockStored(), update: async () => undefined } } },
}));
jest.mock("../utils", () => ({ updateSourceCode: jest.fn(), debug: jest.fn() }));
jest.mock("../utils/logger", () => ({ log: jest.fn() }));
jest.mock("@wso2/ballerina-core", () => ({ isSamePath: jest.fn() }));
// What the managers reach of the running extension; none of it is used here.
jest.mock("../rpc-managers/bi-diagram/rpc-manager", () => ({ BiDiagramRpcManager: class {} }));
jest.mock("../views/visualizer/webview", () => ({ VisualizerWebview: {} }));
jest.mock("../features/devant/add-construct-prompt", () => ({ promptToAddConstruct: jest.fn() }));
jest.mock("../features/devant/integration-type", () => ({ confirmListenerAlongside: jest.fn() }));
jest.mock("../utils/config", () => ({ getOrgPackageName: jest.fn() }));

import { DEVANT_PLATFORM } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { window } from "vscode";
import { DevantPlatformExtRpcManager } from "../rpc-managers/platform-ext/devant/rpc-manager";
import { hydratePlatformExtStore, platformExtStore } from "../rpc-managers/platform-ext/platform-store";
import { PlatformExtRpcManager } from "../rpc-managers/platform-ext/rpc-manager";

const connections = () => platformExtStore.getState().state.devantConns;
const listed = [{ name: "orders" }] as never[];

describe("the stored state, read once for both managers", () => {
    it("tries again after a read that failed, and reads no more once one has taken", async () => {
        let reads = 0;
        mockStored = () => {
            reads++;
            throw new Error("storage is not ready");
        };
        await hydratePlatformExtStore();
        expect(platformExtStore.persist.hasHydrated()).toBe(false);

        // Nothing stored yet is a read that took.
        mockStored = () => {
            reads++;
            return undefined;
        };
        await hydratePlatformExtStore();
        expect(platformExtStore.persist.hasHydrated()).toBe(true);

        await Promise.all([hydratePlatformExtStore(), hydratePlatformExtStore()]);
        expect(reads).toBe(2);
    });
});

describe("a connection list read while the platform switches", () => {
    beforeEach(() => {
        platformExtStore.getState().setConnectionState({ list: [], loading: false });
    });

    it("WSO2 Cloud's manager drops its answer once Devant is in use, and leaves nothing loading", async () => {
        cloudPlatform = undefined;
        const manager = new PlatformExtRpcManager();
        manager.getAllConnections = async () => {
            expect(connections()?.loading).toBe(true);
            cloudPlatform = DEVANT_PLATFORM;
            return listed;
        };
        await manager.refreshConnectionList();
        expect(connections()).toMatchObject({ list: [], loading: false });
    });

    it("Devant's manager drops its answer once WSO2 Cloud is in use, and leaves nothing loading", async () => {
        cloudPlatform = DEVANT_PLATFORM;
        const manager = new DevantPlatformExtRpcManager();
        manager.getAllConnections = async () => {
            expect(connections()?.loading).toBe(true);
            cloudPlatform = undefined;
            return listed;
        };
        await manager.refreshConnectionList();
        expect(connections()).toMatchObject({ list: [], loading: false });
    });

    it("each manager fills the list while its platform stays in use, and neither starts for the other's", async () => {
        cloudPlatform = undefined;
        const cloud = new PlatformExtRpcManager();
        cloud.getAllConnections = async () => listed;
        const devant = new DevantPlatformExtRpcManager();
        devant.getAllConnections = async () => [] as never[];

        await devant.refreshConnectionList();
        expect(connections()).toMatchObject({ list: [], loading: false });
        await cloud.refreshConnectionList();
        expect(connections()).toMatchObject({ list: listed, loading: false });

        cloudPlatform = DEVANT_PLATFORM;
        await cloud.refreshConnectionList();
        expect(connections()?.list).toEqual(listed);
        await devant.refreshConnectionList();
        expect(connections()).toMatchObject({ list: [], loading: false });
    });
});

describe("what a manager read for its platform, written after the platform switched", () => {
    const state = () => platformExtStore.getState().state;
    const write = (manager: unknown, ...args: unknown[]) => (manager as { update(...a: unknown[]): void }).update(...args);

    beforeEach(() => {
        platformExtStore.getState().setState({ isLoggedIn: false, platform: undefined, devant: undefined, hasLocalChanges: false });
    });

    it("Devant's manager writes while Devant is in use, under Devant's name", () => {
        cloudPlatform = DEVANT_PLATFORM;
        write(new DevantPlatformExtRpcManager(), { isLoggedIn: true }, { isLoggedIn: true });
        expect(state()).toMatchObject({ isLoggedIn: true, platform: DEVANT_PLATFORM, devant: { isLoggedIn: true } });
    });

    it("Devant's manager writes nothing once WSO2 Cloud is in use", () => {
        cloudPlatform = undefined;
        write(new DevantPlatformExtRpcManager(), { isLoggedIn: true }, { isLoggedIn: true });
        expect(state()).toMatchObject({ isLoggedIn: false, platform: undefined, devant: undefined });
    });

    it("WSO2 Cloud's manager writes while WSO2 Cloud is in use, and nothing once Devant is", () => {
        cloudPlatform = undefined;
        const manager = new PlatformExtRpcManager();
        write(manager, { isLoggedIn: true });
        expect(state().isLoggedIn).toBe(true);

        cloudPlatform = DEVANT_PLATFORM;
        write(manager, { isLoggedIn: false, hasLocalChanges: true });
        expect(state()).toMatchObject({ isLoggedIn: true, hasLocalChanges: false });
    });
});

describe("a Devant call that fails", () => {
    const failing = () => {
        const manager = new DevantPlatformExtRpcManager();
        (manager as unknown as { withDevant: () => Promise<never> }).withDevant = async () => {
            throw new Error("Devant refused it");
        };
        return manager;
    };
    const shown = jest.spyOn(window, "showErrorMessage");

    beforeEach(() => {
        cloudPlatform = DEVANT_PLATFORM;
        shown.mockClear();
    });

    it("rejects a create and tells the person, so the screen does not go on as if it existed", async () => {
        const manager = failing();
        await expect(manager.createThirdPartyConnection({} as never)).rejects.toThrow("Devant refused it");
        await expect(manager.createInternalConnection({} as never)).rejects.toThrow("Devant refused it");
        await expect(manager.createDatabaseConnection({} as never)).rejects.toThrow("Devant refused it");
        await expect(manager.registerDevantMarketplaceService({ name: "orders" } as never)).rejects.toThrow("Devant refused it");
        expect(shown).toHaveBeenCalledTimes(4);
        expect(shown.mock.calls[0][0]).toContain("Devant refused it");
    });

    it("rejects a read with its reason, without a message of its own", async () => {
        const manager = failing();
        await expect(manager.getMarketplaceItems({} as never)).rejects.toThrow("Devant refused it");
        await expect(manager.getConnection({} as never)).rejects.toThrow("Devant refused it");
        await expect(manager.getMarketplaceIdl({} as never)).rejects.toThrow("Devant refused it");
        await expect(manager.getDevantComponentList({} as never)).rejects.toThrow("Devant refused it");
        expect(shown).not.toHaveBeenCalled();
    });

    it("answers WSO2 Cloud's component list with nothing, on either manager's side of the shapes", async () => {
        expect(await failing().getIntegrationList({} as never)).toEqual([]);
        expect(await new PlatformExtRpcManager().getDevantComponentList({} as never)).toEqual([]);
    });
});
