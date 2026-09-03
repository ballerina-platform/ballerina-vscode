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

import { Typography } from "@wso2/ui-toolkit";
import { useBiWsContext } from "../wsManager/WsClientContext";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import {
    ProjectDestinationForm,
    ProjectDestinationValues,
} from "../ProjectForm/embedded/integrator-form/shared/ProjectDestinationForm";
import { Organization } from "../ProjectForm/embedded/integrator-form/components";
import { ConfigureProjectFormProps } from "./types";

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
 */
export function ConfigureProjectForm({ isMultiProject, onNext, onBack }: ConfigureProjectFormProps) {
    const { wsClient } = useBiWsContext();
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
                secondaryButton={{ text: "Back", onClick: onBack }}
                onSubmit={handleSubmit}
            />
        </>
    );
}
