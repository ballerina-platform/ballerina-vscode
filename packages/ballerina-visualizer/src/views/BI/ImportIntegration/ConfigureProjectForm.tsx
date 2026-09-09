/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { useState } from "react";
import styled from "@emotion/styled";
import { CheckBox, Typography } from "@wso2/ui-toolkit";
import { useBiWsContext } from "../wsManager/WsClientContext";
import { CollapsibleSection } from "../ProjectForm/embedded/integrator-form/components";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import {
    ProjectDestinationForm,
    ProjectDestinationValues,
} from "../ProjectForm/embedded/integrator-form/shared/ProjectDestinationForm";
import { Organization } from "../ProjectForm/embedded/integrator-form/components";
import { ConfigureProjectFormProps } from "./types";

/** Sits under the checkbox label, indented past the box, like the form's other hints. */
const OptionDescription = styled.div`
    color: var(--vscode-list-deemphasizedForeground);
    margin-top: 4px;
    margin-left: 26px;
`;

/**
 * Step 3 of the migration wizard: where the converted sources land.
 *
 * The fields are {@link ProjectDestinationForm} — the same component the Create flow's
 * project chooser renders — so this step and new-project creation stay identical by
 * construction. Two things differ, both driven by what a migration actually produces:
 * there is no Integration / Library starting point to choose (a migration always yields
 * integrations), and a multi-project import has no single integration to name, so only
 * the project and the shared package details are asked for.
 *
 * Nothing is written here. The resolved destination is handed back through `onNext` and
 * only used once the rule-based migration has run and the user picks an action.
 *
 * The one migration-specific question is "Output Structure": whether the migrated sources
 * keep the original file layout. It belongs on this step rather than with the source
 * settings because it describes the shape of what lands at the destination, and because
 * the answer is only needed by the migration that runs after this step — the report
 * generated before it is unaffected.
 */
export function ConfigureProjectForm({
    isMultiProject,
    keepStructure,
    keepStructureParam,
    onKeepStructureChange,
    onNext,
    onBack,
}: ConfigureProjectFormProps) {
    const { wsClient } = useBiWsContext();
    // Open on arrival, unlike the package details below it: this is a decision about the
    // migration's output that the user is expected to look at, not a rarely-touched default.
    const [isOutputStructureExpanded, setIsOutputStructureExpanded] = useState(true);
    const { platformExtState } = usePlatformExtContext();
    const isLoggedIn = !!platformExtState?.isLoggedIn;
    const organizations = isLoggedIn
        ? (platformExtState?.userInfo?.organizations as Organization[] | undefined)
        : undefined;

    const handleSubmit = async (values: ProjectDestinationValues) => {
        await onNext(
            {
                // The project (workspace) the migrated packages land in.
                workspaceName: values.projectName,
                projectPath: values.location,
                directoryName: values.directoryName,
                createDirectory: true,
                createAsWorkspace: true,
                newProject: values.newProject,
                // The single migrated integration. Absent for a multi-project import,
                // where each package is named by the migration tool.
                projectName: values.integrationName || undefined,
                packageName: values.packageName || undefined,
                orgName: values.orgName || undefined,
                orgHandle: values.orgHandle,
                version: values.version || undefined,
            },
            false
        );
    };

    // Label and description come from the tool's own metadata, so a wording change ships
    // with the migration tool instead of needing a matching edit here.
    const outputStructureSection = keepStructureParam ? (
        <CollapsibleSection
            isExpanded={isOutputStructureExpanded}
            onToggle={() => setIsOutputStructureExpanded((expanded) => !expanded)}
            icon="gear"
            title="Output Structure"
        >
            <CheckBox
                label={keepStructureParam.label}
                checked={keepStructure}
                onChange={onKeepStructureChange}
            />
            {keepStructureParam.description && (
                <OptionDescription>{keepStructureParam.description}</OptionDescription>
            )}
        </CollapsibleSection>
    ) : undefined;

    return (
        <>
            <Typography variant="h2">
                {isMultiProject ? "Configure Multi-Project Import" : "Configure Your Integration"}
            </Typography>

            <ProjectDestinationForm
                wsClient={wsClient}
                organizations={organizations}
                collectArtifact={!isMultiProject}
                artifactNoun={isMultiProject ? "integrations" : "integration"}
                submitLabel="Start Migration"
                submittingLabel="Starting..."
                submitErrorPrefix="Failed to start the migration."
                additionalSection={outputStructureSection}
                secondaryButton={{ text: "Back", onClick: onBack }}
                onSubmit={handleSubmit}
            />
        </>
    );
}
