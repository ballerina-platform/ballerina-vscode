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

import { useState } from "react";
import { Button } from "@wso2/ui-toolkit";
import { CreateFlowShell } from "./shared/CreateFlowShell";
import { FormFooter } from "./shared/FormPageLayout";
import { ProjectTypeSelector } from "../../components";
import { LibraryCreationView } from "./LibraryCreationView";
import { CreateIntegrationWizard } from "../../../CreateIntegrationWizard";
import { BiWsClient } from "../../../wsManager/WsClient";
import { BiWsClientProvider } from "../../../wsManager/WsClientContext";

/** Which screen of the fallback flow is showing. */
type Screen = "chooser" | "integration" | "library";

interface StandaloneCreateChooserProps {
    /** The wizard client (native BI WS) used by the integration route. */
    biWsClient: BiWsClient;
    ballerinaUnavailable?: boolean;
    /** Exit the whole Create flow (back to the welcome view). */
    onBack?: () => void;
}

/**
 * Fallback for the unified Create flow's project chooser: the connected
 * Ballerina distribution doesn't support projects/workspaces (needs 2201.13.0+),
 * so there is no project to pick or create. This skips straight to choosing an
 * integration or library and hands off to the same standalone wizard/library
 * views used before the project chooser existed (no project context — no
 * workspace is created).
 */
export function StandaloneCreateChooser({ biWsClient, ballerinaUnavailable, onBack }: StandaloneCreateChooserProps) {
    const [screen, setScreen] = useState<Screen>("chooser");
    const [isLibrary, setIsLibrary] = useState(false);

    if (screen === "integration") {
        return (
            <BiWsClientProvider wsClient={biWsClient} onBack={onBack}>
                <CreateIntegrationWizard showHeader={false} onBackToChooser={() => setScreen("chooser")} />
            </BiWsClientProvider>
        );
    }

    if (screen === "library") {
        return <LibraryCreationView onBack={() => setScreen("chooser")} ballerinaUnavailable={ballerinaUnavailable} />;
    }

    return (
        <CreateFlowShell
            title="Create"
            subtitle="Your connected Ballerina distribution doesn't support projects — you can still create a standalone integration or library."
            onBack={onBack}
        >
            <ProjectTypeSelector
                label="Choose your starting point"
                value={isLibrary}
                onChange={setIsLibrary}
                note="Update your Ballerina distribution to 2201.13.0 or above to organize integrations and libraries into a project."
            />
            <FormFooter>
                <span title={ballerinaUnavailable ? "Ballerina distribution is not set up. Use Configure to set it up." : undefined}>
                    <Button
                        disabled={ballerinaUnavailable}
                        onClick={() => setScreen(isLibrary ? "library" : "integration")}
                        appearance="primary"
                    >
                        Next
                    </Button>
                </span>
            </FormFooter>
        </CreateFlowShell>
    );
}

export default StandaloneCreateChooser;
