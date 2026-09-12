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

/**
 * Runs the whole-diagram "no link crosses an unrelated node" check (see linkOverlapChecker.ts)
 * over every sample project, so an overlap regression in ANY of them fails here with real
 * coordinates - rather than waiting for someone to spot it in a screenshot.
 *
 * The fixtures are fed in raw, exactly as `Diagram.stories.tsx` hands them to `<Diagram>` and as
 * the extension hands over a real `CDModel`; unlike Diagram.test.tsx's `convertToCDModel` (which
 * whitelists only the fields its DOM snapshots need) that keeps every field that can affect
 * layout - sortText ordering, service-level connections, workflow activities.
 */

import { CDModel } from "@wso2/ballerina-core";
import { checkNoLinkCrossesAnyNode } from "./linkOverlapChecker";

import model1 from "../stories/1-empty.json";
import model2 from "../stories/2-only-automation.json";
import model3 from "../stories/3-simple-service.json";
import model4 from "../stories/4-multiple-services.json";
import model5 from "../stories/5-connection-complex.json";
import model6 from "../stories/6-ai-agent-complex.json";
import model7 from "../stories/7-graphql-complex.json";
import model8 from "../stories/8-multiple-connections-complex.json";
import model9 from "../stories/9-workflow-overlap.json";
import model10 from "../stories/10-workflow-function-port-overlap.json";
import model11 from "../stories/11-stacked-workflows-overlap.json";

/** The imported JSON's inferred shape is narrower than CDModel's optional fields, hence the cast. */
const fixture = (name: string, model: unknown): [string, CDModel] => [name, model as CDModel];

const fixtures = [
    fixture("1-empty", model1),
    fixture("2-only-automation", model2),
    fixture("3-simple-service", model3),
    fixture("4-multiple-services", model4),
    fixture("5-connection-complex", model5),
    fixture("6-ai-agent-complex", model6),
    fixture("7-graphql-complex", model7),
    fixture("8-multiple-connections-complex", model8),
    fixture("9-workflow-overlap", model9),
    fixture("10-workflow-function-port-overlap", model10),
    fixture("11-stacked-workflows-overlap", model11),
];

describe("no link crosses an unrelated node", () => {
    test.each(fixtures)("%s", (name, project) => {
        checkNoLinkCrossesAnyNode(project, name);
    });
});
