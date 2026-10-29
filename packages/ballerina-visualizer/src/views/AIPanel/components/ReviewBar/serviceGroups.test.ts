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

import type { SemanticDiff } from "@wso2/ballerina-core";

// The real barrel pulls in the LS websocket client, which jest can't load.
jest.mock("@wso2/ballerina-core", () => ({
    NodeKindEnum: {
        MODULE_FUNCTION: 0,
        OBJECT_FUNCTION: 1,
        TYPE_DEFINITION: 2,
    },
}));

import { getServiceGroupInfo } from "./serviceGroups";

const OBJECT_FUNCTION = 1;
const LINE_RANGE = { fileName: "main.bal", startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } };

function diff(metadata: SemanticDiff["metadata"], nodeKind = OBJECT_FUNCTION): SemanticDiff {
    return { changeType: 0, nodeKind, uri: "ai:///main.bal", lineRange: LINE_RANGE, metadata };
}

// One member of each distinct service, in every metadata shape the LS sends for a service member.
const SERVICES: Array<{ service: string; member: SemanticDiff; title: string; path: string }> = [
    {
        service: "http service with a base path",
        member: diff({ accessor: "post", servicePath: "/orders", serviceType: "http", resourcePath: "." }),
        title: "http service",
        path: "/orders",
    },
    {
        // issue-2264: a path-less solace service used to render as "service /".
        service: "solace service without a base path",
        member: diff({ name: "onMessage", servicePath: "", serviceType: "solace", functionKind: "remote" }),
        title: "solace service",
        path: "",
    },
    {
        service: "http service without a base path",
        member: diff({ accessor: "get", servicePath: "", serviceType: "http", resourcePath: "health" }),
        title: "http service",
        path: "",
    },
    {
        service: "kafka service sharing the http service's base path",
        member: diff({ name: "onConsumerRecord", servicePath: "/orders", serviceType: "kafka", functionKind: "remote" }),
        title: "kafka service",
        path: "/orders",
    },
    {
        service: "service whose type the LS couldn't resolve",
        member: diff({ name: "onMessage", servicePath: "" }),
        title: "service",
        path: "/",
    },
    {
        // An older LS sends no serviceType at all.
        service: "service from an older LS",
        member: diff({ accessor: "get", servicePath: "/legacy", resourcePath: "items" }),
        title: "service",
        path: "/legacy",
    },
];

function titleOf(member: SemanticDiff): string {
    const info = getServiceGroupInfo(member);
    return info.serviceType ? `${info.serviceType} service` : "service";
}

describe("getServiceGroupInfo", () => {
    it.each(SERVICES)("titles a $service as '$title $path'", ({ member, title, path }) => {
        expect(titleOf(member)).toBe(title);
        expect(getServiceGroupInfo(member).displayPath).toBe(path);
    });

    it("never puts two different services in the same group", () => {
        const keys = SERVICES.map(({ member }) => getServiceGroupInfo(member).key);
        expect(new Set(keys).size).toBe(SERVICES.length);
    });

    it("groups every member of a service together", () => {
        const resource = diff({ accessor: "get", servicePath: "/orders", serviceType: "http", resourcePath: "items" });
        const otherResource = diff({ accessor: "post", servicePath: "/orders", serviceType: "http", resourcePath: "." });
        expect(getServiceGroupInfo(resource).key).toBe(getServiceGroupInfo(otherResource).key);
    });

    it("never titles a service group with an empty header", () => {
        for (const { member } of SERVICES) {
            const info = getServiceGroupInfo(member);
            expect(`${titleOf(member)} ${info.displayPath}`.trim()).not.toBe("service");
        }
    });

    it.each([
        { shape: "class method", member: diff({ name: "process" }) },
        { shape: "module function", member: diff({ name: "main" }, 0) },
        { shape: "OBJECT_FUNCTION without metadata", member: diff(undefined) },
    ])("leaves a $shape out of every service group", ({ member }) => {
        expect(getServiceGroupInfo(member)).toBeUndefined();
    });
});
