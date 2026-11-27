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

// The shared field description that ExpressionEditor and ReadonlyField render under a field's label:
// the display rule for the documentation text, and the component that renders it as markdown.

import React from "react";
import { render, screen } from "@testing-library/react";
import { FieldDescription, formatFieldDocumentation } from "../components/editors/FieldDescription";

describe("formatFieldDocumentation", () => {
    it.each([
        ["adds a missing period", "Port to bind", "Port to bind."],
        ["keeps an existing period", "Port to bind.", "Port to bind."],
        ["drops trailing whitespace before adding the period", "Port to bind \n", "Port to bind."],
        ["keeps a question mark", "Use TLS?", "Use TLS?"],
        ["keeps an exclamation mark", "Required!", "Required!"],
        ["keeps a colon", "For example:", "For example:"],
        ["leaves a closing code fence intact", "For example:\n```bal\nx\n```\n", "For example:\n```bal\nx\n```"],
        ["leaves a closing tilde fence intact", "Run:\n~~~\nx\n~~~", "Run:\n~~~\nx\n~~~"],
        ["returns empty text for whitespace", " \n ", ""],
        ["returns empty text for no documentation", undefined, ""],
    ])("%s", (_case, documentation, expected) => {
        expect(formatFieldDocumentation(documentation)).toBe(expected);
    });
});

describe("FieldDescription", () => {
    it("renders the documentation as markdown", () => {
        render(<FieldDescription documentation="Binds to `http:Listener`" testId="description" />);
        const description = screen.getByTestId("description");
        expect(description.textContent).toBe("Binds to http:Listener.");
        expect(description.querySelector("code")?.textContent).toBe("http:Listener");
    });

    it.each([
        ["no documentation", undefined],
        ["empty documentation", ""],
        ["whitespace-only documentation", "\n"],
    ])("renders nothing for %s", (_case, documentation) => {
        const { container } = render(<FieldDescription documentation={documentation} testId="description" />);
        expect(container).toBeEmptyDOMElement();
    });

    it("puts the caller's className on its own container", () => {
        render(<FieldDescription documentation="Port to bind" testId="description" className="caller-style" />);
        expect(screen.getByTestId("description")).toHaveClass("caller-style");
    });
});
