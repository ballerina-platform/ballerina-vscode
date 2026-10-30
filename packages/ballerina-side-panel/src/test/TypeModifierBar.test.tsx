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

// L2: TypeModifierBar (product-integrator#1820). The toggles show the modifiers the type holds and rewrite the type
// when turned.

import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { TypeModifierBar } from "../components/editors/TypeModifierBar";
import { TypeModifier } from "../components/editors/typeModifiers";

const ALL: TypeModifier[] = ["list", "nullable", "error"];

describe("TypeModifierBar", () => {
    it("renders only the modifiers offered", () => {
        const { queryByTestId } = render(<TypeModifierBar value="Profile" modifiers={["list", "nullable"]} onChange={jest.fn()} />);
        expect(queryByTestId("type-modifier-list")).toBeInTheDocument();
        expect(queryByTestId("type-modifier-nullable")).toBeInTheDocument();
        expect(queryByTestId("type-modifier-error")).not.toBeInTheDocument();
    });

    it("shows each toggle as pressed when the type holds its modifier", () => {
        const { getByTestId } = render(<TypeModifierBar value="Profile[]|error" modifiers={ALL} onChange={jest.fn()} />);
        expect(getByTestId("type-modifier-list")).toHaveAttribute("aria-pressed", "true");
        expect(getByTestId("type-modifier-nullable")).toHaveAttribute("aria-pressed", "false");
        expect(getByTestId("type-modifier-error")).toHaveAttribute("aria-pressed", "true");
    });

    it.each([
        ["nullable", "Profile[]?|error"],
        ["list", "Profile|error"],
        ["error", "Profile[]"],
    ] as [TypeModifier, string][])("turning %s rewrites the type to %s", (modifier, expected) => {
        const onChange = jest.fn();
        const { getByTestId } = render(<TypeModifierBar value="Profile[]|error" modifiers={ALL} onChange={onChange} />);
        fireEvent.click(getByTestId(`type-modifier-${modifier}`));
        expect(onChange).toHaveBeenCalledWith(expected);
    });

    it("disables the toggles until a type is entered", () => {
        const { getByTestId } = render(<TypeModifierBar value="" modifiers={ALL} onChange={jest.fn()} />);
        ALL.forEach((modifier) => expect(getByTestId(`type-modifier-${modifier}`)).toBeDisabled());
    });

    it("explains each toggle and the syntax it writes", () => {
        const { getByTestId } = render(<TypeModifierBar value="Profile" modifiers={ALL} onChange={jest.fn()} />);
        expect(getByTestId("type-modifier-list")).toHaveAccessibleName(/List: Holds a list of values/);
        expect(getByTestId("type-modifier-error")).toHaveAccessibleName(/Returns error: Can produce an error/);
    });
});
