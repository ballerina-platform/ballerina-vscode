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

import { CreateIntegrationWizard } from "../CreateIntegrationWizard";
import { useProductTerms } from "../ProjectForm/useProductTerms";
import { CreateFlowShell } from "../ProjectForm/embedded/integrator-form/shared/CreateFlowShell";
import { BiWsClientProvider } from "../wsManager/WsClientContext";

interface AddIntegrationPanelProps {
    /** Root of the existing, empty package the artifact is generated into. */
    packageRoot: string;
    /** Display name of that package, shown in the shell subtitle. */
    integrationName?: string;
    /** Dismisses the panel — on the back arrow and after the artifact was added. */
    onClose: () => void;
}

/**
 * Hosts the Create Integration wizard inside the package overview, for a user who
 * skipped the wizard at creation time and is now continuing from their empty
 * integration. Same shell and embedding contract as the unified Create flow
 * (`AddProjectForm`), but pointed at the already-created package: the wizard
 * collects only the artifact type + configuration and generates it in place, so
 * the user returns to the overview they came from instead of reloading anywhere.
 */
export function AddIntegrationPanel({ packageRoot, integrationName, onClose }: AddIntegrationPanelProps) {
    const terms = useProductTerms();
    return (
        <CreateFlowShell
            title={`Add ${terms.integrationLabel}`}
            subtitle={integrationName ? `Continue setting up ${integrationName}.` : undefined}
            onBack={onClose}
            bodyFill
            fill
        >
            {/* The wizard's model/diagnostics calls go over the WS bridge, the same
                seam the pre-project Create flow uses. */}
            <BiWsClientProvider onBack={onClose}>
                <CreateIntegrationWizard
                    embedded
                    showHeader={false}
                    existingPackagePath={packageRoot}
                    onArtifactAdded={onClose}
                />
            </BiWsClientProvider>
        </CreateFlowShell>
    );
}

export default AddIntegrationPanel;
