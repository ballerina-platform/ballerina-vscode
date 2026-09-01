/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

jest.mock("@wso2/ballerina-core", () => {
    const SCOPE = {
        EVENT_INTEGRATION: "EVENT_INTEGRATION",
        FILE_INTEGRATION: "FILE_INTEGRATION",
        INTEGRATION_AS_API: "INTEGRATION_AS_API",
        WORKFLOW: "WORKFLOW",
        AUTOMATION: "AUTOMATION",
        LIBRARY: "LIBRARY",
    };
    const byKind: Record<string, string> = {
        event: SCOPE.EVENT_INTEGRATION,
        file: SCOPE.FILE_INTEGRATION,
        http: SCOPE.INTEGRATION_AS_API,
        graphql: SCOPE.INTEGRATION_AS_API,
    };
    const byModule: Record<string, string> = {
        kafka: SCOPE.EVENT_INTEGRATION,
        ftp: SCOPE.FILE_INTEGRATION,
        tcp: SCOPE.INTEGRATION_AS_API,
    };
    return {
        SCOPE,
        DIRECTORY_MAP: { SERVICE: "SERVICE", AUTOMATION: "AUTOMATION", WORKFLOW: "WORKFLOW" },
        findScope: (triggerKind?: string, moduleName?: string) =>
            (triggerKind && byKind[triggerKind]) ?? (moduleName && byModule[moduleName]),
        findScopeByModule: (moduleName: string) => byModule[moduleName],
    };
});

import { DIRECTORY_MAP, SCOPE } from "@wso2/ballerina-core";
import type { ProjectStructure } from "@wso2/ballerina-core";
import { getIntegrationTypes } from "./utils";

function projectWithServices(
    services: Array<{ moduleName: string; triggerKind?: string; kind?: string }>
): ProjectStructure {
    return {
        projectName: "sample",
        directoryMap: {
            [DIRECTORY_MAP.SERVICE]: services.map((service, index) => ({
                id: String(index),
                name: service.moduleName,
                path: "/sample/main.bal",
                type: DIRECTORY_MAP.SERVICE,
                ...service,
            })),
        } as ProjectStructure["directoryMap"],
    };
}

describe("deployment scope extraction", () => {
    it("uses triggerKind for connectors absent from legacy module lists", () => {
        expect(getIntegrationTypes(projectWithServices([
            { moduleName: "new.events", triggerKind: "event" },
            { moduleName: "new.files", triggerKind: "file" },
            { moduleName: "new.api", triggerKind: "http" },
        ]))).toEqual([
            SCOPE.EVENT_INTEGRATION,
            SCOPE.FILE_INTEGRATION,
            SCOPE.INTEGRATION_AS_API,
        ]);
    });

    it("accepts legacy kind and module-only responses", () => {
        expect(getIntegrationTypes(projectWithServices([
            { moduleName: "unknown", kind: "event" },
            { moduleName: "ftp" },
        ]))).toEqual([SCOPE.EVENT_INTEGRATION, SCOPE.FILE_INTEGRATION]);
    });
});
