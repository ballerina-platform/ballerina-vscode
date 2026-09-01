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

import React from "react";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { FormField } from "../components/Form/types";
import { ChoiceForm } from "../components/editors/ChoiceForm";
import { Context } from "../context";

const branch = (label: string, enabled: boolean, properties: Record<string, unknown>) => ({
    metadata: { label, description: "" },
    types: [{ fieldType: "FORM", selected: true }],
    enabled,
    editable: true,
    optional: false,
    properties,
});

const choiceField = (): FormField =>
    ({
        key: "configureEndpoint",
        label: "Endpoint",
        type: "CHOICE",
        documentation: "Serve the agent from a new service or one that already exists.",
        editable: true,
        enabled: true,
        optional: false,
        value: "",
        types: [{ fieldType: "CHOICE", selected: true }],
        choices: [
            branch("Create a new service", true, {
                basePath: {
                    metadata: { label: "Endpoint Path", description: "" },
                    types: [{ fieldType: "SERVICE_PATH", selected: true, ballerinaType: "string" }],
                    enabled: true, editable: true, optional: false, value: "/agent",
                },
            }),
            branch("Use an existing service", false, {
                existingService: {
                    metadata: { label: "Select Service", description: "" },
                    types: [{ fieldType: "SINGLE_SELECT", selected: true }],
                    items: ["/orders"],
                    enabled: true, editable: true, optional: false, value: "/orders",
                },
            }),
        ],
    } as unknown as FormField);

function Harness() {
    const form = useForm();
    return (
        <Context.Provider value={{ form, targetLineRange: undefined, fileName: "main.bal" } as never}>
            <ChoiceForm field={choiceField()} />
        </Context.Provider>
    );
}

describe("ChoiceForm default branch", () => {
    it("renders the enabled branch's fields, not the other branch's", () => {
        render(<Harness />);

        expect(screen.queryByText("Endpoint Path")).not.toBeNull();
        expect(screen.queryByText("Select Service")).toBeNull();
    });
});
