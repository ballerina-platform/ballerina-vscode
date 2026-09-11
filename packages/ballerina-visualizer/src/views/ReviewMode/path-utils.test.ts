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

import { diffBelongsToPackage, toComparablePath } from "./path-utils";

// Matching a diff's uri to a package decides its label, its project path, and its type view.
const SCHOOL = "/ws/education/school";
const INSTITUTES = "/ws/education/institutes";

describe("review mode diff-to-package attribution", () => {
    it("strips the ai:// baseline scheme", () => {
        expect(toComparablePath(`ai://${SCHOOL}/types.bal`)).toBe(`${SCHOOL}/types.bal`);
    });

    it("strips file:// too, and leaves a plain path alone", () => {
        expect(toComparablePath(`file://${SCHOOL}/types.bal`)).toBe(`${SCHOOL}/types.bal`);
        expect(toComparablePath(`${SCHOOL}/types.bal`)).toBe(`${SCHOOL}/types.bal`);
    });

    it("normalises windows separators", () => {
        expect(toComparablePath("ai://C:\\ws\\school\\types.bal")).toBe("C:/ws/school/types.bal");
    });

    it("decodes a percent-encoded path", () => {
        expect(toComparablePath("ai:///ws/my%20project/school/types.bal")).toBe(
            "/ws/my project/school/types.bal"
        );
        expect(diffBelongsToPackage("ai:///ws/my%20project/school/types.bal", "/ws/my project/school")).toBe(true);
    });

    it("leaves a malformed escape alone rather than throwing", () => {
        expect(() => toComparablePath("ai:///ws/100%/school/types.bal")).not.toThrow();
    });

    it("drops the leading slash the three-slash form leaves before a drive letter", () => {
        expect(toComparablePath("file:///c:/ws/school/types.bal")).toBe("c:/ws/school/types.bal");
        expect(diffBelongsToPackage("file:///c:/ws/school/types.bal", "c:\\ws\\school")).toBe(true);
    });

    it("matches a windows package whose drive letter case differs", () => {
        expect(diffBelongsToPackage("ai:///C:/ws/school/types.bal", "c:\\ws\\school")).toBe(true);
    });

    it("matches an uppercase scheme", () => {
        expect(toComparablePath(`AI://${SCHOOL}/types.bal`)).toBe(`${SCHOOL}/types.bal`);
    });

    it("matches an ai:// diff to its own package and not to a sibling", () => {
        expect(diffBelongsToPackage(`ai://${SCHOOL}/types.bal`, SCHOOL)).toBe(true);
        expect(diffBelongsToPackage(`ai://${SCHOOL}/types.bal`, INSTITUTES)).toBe(false);
    });

    it("does not treat a package as a prefix of a longer sibling name", () => {
        expect(diffBelongsToPackage(`ai://${SCHOOL}-archive/types.bal`, SCHOOL)).toBe(false);
    });

    it("attributes diffs from two packages to their own packages", () => {
        const uris = [`ai://${SCHOOL}/types.bal`, `ai://${INSTITUTES}/types.bal`];
        const owners = uris.map((u) => [SCHOOL, INSTITUTES].find((p) => diffBelongsToPackage(u, p)));
        expect(owners).toEqual([SCHOOL, INSTITUTES]);
    });
});
