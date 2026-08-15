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

import { PROJECT_TYPE_OPTIONS, ProjectTypeOption } from "./components";

/**
 * User-facing wording of the Create and Add flows, which differs per product
 * flavor: Agent Builder never says "integration" on its own — what it creates is
 * an agentic integration. Sentences that only need the noun interpolate
 * `integrationNoun`/`integrationNounPlural` at the call site.
 */
export interface ProductTerms {
    integrationNoun: string;
    integrationNounPlural: string;
    /** Title-cased, for headings ("Add New Agentic Integration"). */
    integrationLabel: string;
    integrationNameLabel: string;
    integrationNamePlaceholder: string;
    createButtonLabel: string;
    /** Starting-point option wording. Unset fields keep the shared defaults. */
    integrationOptionTitle?: string;
    integrationOptionDescription?: string;
    libraryOptionDescription?: string;
}

const INTEGRATOR_TERMS: ProductTerms = {
    integrationNoun: "integration",
    integrationNounPlural: "integrations",
    integrationLabel: "Integration",
    integrationNameLabel: "Integration name",
    integrationNamePlaceholder: "Enter an integration name",
    createButtonLabel: "Create Integration",
};

const AGENT_BUILDER_TERMS: ProductTerms = {
    integrationNoun: "agentic integration",
    integrationNounPlural: "agentic integrations",
    integrationLabel: "Agentic Integration",
    integrationNameLabel: "Agentic integration name",
    integrationNamePlaceholder: "Enter a name for your agentic integration",
    createButtonLabel: "Create Agentic Integration",
    integrationOptionTitle: "Create an agentic integration",
    integrationOptionDescription: "Build AI agents with tools, memory, and the triggers that invoke them.",
    libraryOptionDescription:
        "Build reusable components and utilities that can be shared across agentic integrations.",
};

export function getProductTerms(isAgentBuilder: boolean | undefined): ProductTerms {
    return isAgentBuilder ? AGENT_BUILDER_TERMS : INTEGRATOR_TERMS;
}

/** The starting-point options with this flavor's wording applied. */
export function projectTypeOptions(terms: ProductTerms): ProjectTypeOption[] {
    return PROJECT_TYPE_OPTIONS.map((option) =>
        option.value === "library"
            ? { ...option, description: terms.libraryOptionDescription ?? option.description }
            : {
                ...option,
                title: terms.integrationOptionTitle ?? option.title,
                description: terms.integrationOptionDescription ?? option.description,
            }
    );
}
