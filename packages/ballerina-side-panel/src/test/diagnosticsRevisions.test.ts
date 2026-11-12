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

import { createDiagnosticsRevisions } from "../components/Form/diagnosticsRevisions";

describe("createDiagnosticsRevisions", () => {
    it("accepts only the newest request's answer for a field, whatever order the answers arrive in", () => {
        const revisions = createDiagnosticsRevisions();
        const requests = [1, 2, 3].map(() => revisions.next("type"));
        const newest = requests[requests.length - 1];

        for (const revision of [...requests].reverse()) {
            expect(revisions.isCurrent("type", revision)).toBe(revision === newest);
        }
    });

    it("keeps each field's revisions apart, so an edit to one field never discards another's answer", () => {
        const revisions = createDiagnosticsRevisions();
        const typeRevision = revisions.next("type");
        revisions.next("name");
        revisions.next("name");

        expect(revisions.isCurrent("type", typeRevision)).toBe(true);
    });

    it("rejects a revision for a field that never asked", () => {
        const revisions = createDiagnosticsRevisions();

        expect(revisions.isCurrent("type", 1)).toBe(false);
    });
});
