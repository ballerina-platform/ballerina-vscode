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

// Reference L2 test: the fixture -> render -> assert-semantics pattern that the
// EditorFactory selection invariant is built on (docs/TEST_BACKLOG.md L2-01).
// Each fixture asserts that a given field type selects the correct editor.
// Add a fixture under fixtures/fields/ (e.g. issue-1491.json) to guard a new case.

import { screen } from "@testing-library/react";
import { loadFixtures } from "@wso2/test-config/fixtures";
import { mockEditors, renderField } from "./helpers";

// Stub every child editor so we can assert *which* one is selected.
mockEditors();

interface FieldFixture {
    description?: string;
    expectedEditor: string;
    fieldInputType: any;
    field: any;
}

const fixtures = loadFixtures<FieldFixture>(__dirname, "fixtures", "fields");

describe("EditorFactory editor selection", () => {
    it("has fixtures to run", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    it.each(fixtures.map((f) => [f.name, f.data] as [string, FieldFixture]))(
        "%s -> selects the expected editor",
        (_name, fx) => {
            renderField(fx.field, fx.fieldInputType);
            expect(screen.getByTestId(fx.expectedEditor)).toBeInTheDocument();
        }
    );
});
