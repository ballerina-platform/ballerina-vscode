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

import { getServiceGroupInfo, getServiceGroupTitle, qualifyServiceGroups } from "./serviceGroups";

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

// issue-2816: services that share a type and path, told apart by serviceId.
function pathless(serviceId: string, serviceType?: string, serviceListeners?: string, name = "onMessage"): SemanticDiff {
    return diff({ name, servicePath: "", serviceType, serviceId, serviceListeners, functionKind: "remote" });
}

const IDENTIFIED = {
    orderSolace: pathless("ai:///main.bal#3", "solace", "orderListener"),
    paymentSolace: pathless("ai:///main.bal#12", "solace", "paymentListener"),
    ordersConsumer: pathless("ai:///consumers.bal#4", "rabbitmq", "channelListener"),
    paymentsConsumer: pathless("ai:///consumers.bal#9", "rabbitmq", "channelListener"),
    inlineSolace: pathless("ai:///main.bal#20", "solace"),
    // Removed, and declared where orderSolace now is
    removedSolace: pathless("ai:///main.bal#3#removed", "solace", "orderListener"),
    untypedNamed: pathless("ai:///main.bal#30", undefined, "customListener"),
    untypedInline: pathless("ai:///main.bal#40"),
    http: diff({ accessor: "get", servicePath: "/orders", serviceType: "http", serviceId: "ai:///main.bal#50",
        serviceListeners: "httpListener", resourcePath: "items" }),
};

function qualifiedTitles(members: SemanticDiff[]): string[] {
    const services = members.map(getServiceGroupInfo);
    qualifyServiceGroups(services);
    return services.map(getServiceGroupTitle);
}

describe("services the LS identifies", () => {
    const members = Object.values(IDENTIFIED);

    it("never puts two different services in the same group", () => {
        const keys = members.map((member) => getServiceGroupInfo(member).key);
        expect(new Set(keys).size).toBe(members.length);
    });

    it("groups every member of a service together", () => {
        const onError = pathless("ai:///main.bal#3", "solace", "orderListener", "onError");
        expect(getServiceGroupInfo(onError).key).toBe(getServiceGroupInfo(IDENTIFIED.orderSolace).key);
    });

    it("gives every service group a header of its own", () => {
        const titles = qualifiedTitles(members);
        expect(new Set(titles).size).toBe(titles.length);
    });

    it("never shows a bare 'service'", () => {
        expect(qualifiedTitles(members)).not.toContain("service");
    });

    // With neither a type nor a listener name, "/" keeps the header from being a bare "service".
    it("never shows a path that isn't in the code when the LS sends a type or a listener name", () => {
        const titles = qualifiedTitles(members);
        members.forEach((member, i) => {
            const { serviceType, listeners } = getServiceGroupInfo(member);
            if (serviceType || listeners) {
                expect(titles[i]).not.toMatch(/ \/(?: |$)/);
            }
        });
    });

    it("names the listener only when the header would otherwise be shared", () => {
        expect(qualifiedTitles([IDENTIFIED.orderSolace, IDENTIFIED.http]))
            .toEqual(["solace service", "http service /orders"]);
        expect(qualifiedTitles([IDENTIFIED.orderSolace, IDENTIFIED.paymentSolace]))
            .toEqual(["solace service on orderListener", "solace service on paymentListener"]);
    });

    it("numbers services the listener can't tell apart, in order", () => {
        expect(qualifiedTitles([IDENTIFIED.ordersConsumer, IDENTIFIED.paymentsConsumer]))
            .toEqual(["rabbitmq service on channelListener (1)", "rabbitmq service on channelListener (2)"]);
    });

    it("names the listener of an untyped service without a base path instead of showing '/'", () => {
        expect(qualifiedTitles([IDENTIFIED.untypedNamed])).toEqual(["service on customListener"]);
        expect(qualifiedTitles([IDENTIFIED.untypedInline])).toEqual(["service /"]);
    });
});
