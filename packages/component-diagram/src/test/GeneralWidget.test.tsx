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
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CDService } from "@wso2/ballerina-core";
import { getServiceIcon } from "../components/nodes/EntryNode/components/GeneralWidget";

function service(type: string, icon?: string): CDService {
    return {
        location: {
            filePath: "service.bal",
            startLine: { line: 1, offset: 0 },
            endLine: { line: 1, offset: 0 },
        },
        attachedListeners: [],
        connections: [],
        functions: [],
        remoteFunctions: [],
        resourceFunctions: [],
        absolutePath: "/service",
        type,
        icon,
        uuid: "service",
        enableFlowModel: true,
        sortText: "service",
    };
}

describe("getServiceIcon", () => {
    test("uses the Central icon before falling back to the generic globe for non-HTTP services", () => {
        const view = render(getServiceIcon(service("websocket:Service", "https://central.test/websocket.png")));
        expect(view.getByRole("img")).toHaveAttribute("src", "https://central.test/websocket.png");
        fireEvent.error(view.getByRole("img"));
        expect(view.container.querySelector(".fw-bi-globe")).toBeInTheDocument();
        expect(view.container.querySelector("svg")).not.toBeInTheDocument();
    });

    test("uses the generic globe when a non-HTTP service has no icon", () => {
        const view = render(getServiceIcon(service("websocket:Service")));
        expect(view.container.querySelector(".fw-bi-globe")).toBeInTheDocument();
        expect(view.container.querySelector("svg")).not.toBeInTheDocument();
    });

    test("uses the module's brand glyph when it has one", () => {
        const view = render(getServiceIcon(service("grpc:Service")));
        expect(view.container.querySelector(".fw-bi-grpc")).toBeInTheDocument();
        expect(view.container.querySelector(".fw-bi-globe")).not.toBeInTheDocument();
    });

    test.each(["http:Service", "http:InterceptableService"])("keeps the HTTP glyph for %s", (type) => {
        const view = render(getServiceIcon(service(type)));
        expect(view.container.querySelector("svg")).toBeInTheDocument();
        expect(view.container.querySelector(".fw-bi-globe")).not.toBeInTheDocument();
    });
});
