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

import { useVisualizerContext } from "./context/WsClientContext";
import { useCloudContext } from "./providers";
import { CreateFlowShell } from "./shared/CreateFlowShell";
import {
    ProjectDestinationForm,
    ProjectDestinationValues,
} from "./shared/ProjectDestinationForm";
import { LibraryCreationView } from "./LibraryCreationView";
import { Organization } from "./components";
import { BiWsClient } from "../../../wsManager/WsClient";

interface CreateProjectChooserProps {
    /** The wizard client (native BI WS) used by the integration route. */
    biWsClient: BiWsClient;
    ballerinaUnavailable?: boolean;
    /**
     * The extension has not yet determined whether the connected distribution supports
     * projects/workspaces. The form is fully usable meanwhile — only leaving this screen
     * is held back, because the answer decides which flow the user is routed into.
     */
    workspaceSupportPending?: boolean;
    /** Exit the whole Create flow (back to the welcome view). */
    onBack?: () => void;
}

/**
 * Screen 1 of the Create flow: pick the project and the starting point (integration or
 * library). The Default project is pre-selected; existing vs new is detected live and
 * shown under the location field.
 *
 * The integration route finishes here — the name the wizard's first step used to collect
 * is asked for inline, and Create submits an empty integration. The library route still
 * hands off to the library form in the same shell.
 *
 * The fields themselves live in {@link ProjectDestinationForm}, which the migration
 * wizard's Configure Destination step renders too, so the two stay identical by
 * construction rather than by discipline.
 */
export function CreateProjectChooser({
    biWsClient,
    ballerinaUnavailable,
    workspaceSupportPending,
    onBack,
}: CreateProjectChooserProps) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const organizations = authState?.userInfo?.organizations as Organization[] | undefined;

    /**
     * Integration route: create the project and an EMPTY integration package inside it,
     * straight from this screen. The artifact-type/configure steps are skipped for now,
     * so no artifact is sent — the same payload the wizard's "Create Empty Integration"
     * used to submit. The extension reloads the window from here, so the form stays in
     * the creating state until it is torn down.
     */
    const handleCreateIntegration = async (values: ProjectDestinationValues) => {
        await biWsClient.createIntegration({
            project: {
                integrationName: values.integrationName,
                packageName: values.packageName,
                projectPath: values.projectPath,
                directoryName: values.artifactDirectoryName,
                newProject: values.newProject,
                workspaceName: values.projectName,
                orgName: values.orgName || undefined,
                orgHandle: values.orgHandle,
                version: values.version || undefined,
            },
        });
    };

    return (
        <CreateFlowShell
            title="Create"
            subtitle="A project helps you organize your integrations and libraries."
            onBack={onBack}
        >
            <ProjectDestinationForm
                wsClient={wsClient}
                organizations={organizations}
                showStartingPoint={true}
                renderLibraryRoute={({ projectContext, canProceed }) => (
                    <LibraryCreationView
                        embedded
                        projectContext={projectContext}
                        ballerinaUnavailable={ballerinaUnavailable}
                        isCreateDisabled={!canProceed || workspaceSupportPending}
                    />
                )}
                submitLabel="Create Integration"
                submittingLabel="Creating..."
                submitErrorPrefix="Failed to create the integration."
                submitDisabled={ballerinaUnavailable || workspaceSupportPending}
                submitDisabledTooltip={
                    ballerinaUnavailable
                        ? "Ballerina distribution is not set up. Use Configure to set it up."
                        : workspaceSupportPending
                            ? "Finishing start-up…"
                            : undefined
                }
                onSubmit={handleCreateIntegration}
            />
        </CreateFlowShell>
    );
}

export default CreateProjectChooser;
