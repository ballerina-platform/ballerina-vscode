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

import { useEffect, useRef } from "react";
import { URI, Utils } from "vscode-uri";
import { useModalStack } from "../../../../Context";
import { ConnectionCreateWizard } from "../../../../components/ConnectionSelector";
import { CONNECTIONS_FILE } from "../../../../constants";

const MODAL_ID = "add-model-provider";

export interface AddModelProviderPopupProps {
    projectPath: string;
    onNavigateToOverview: () => void;
}

// Opens the same select-then-create flow an agent's Model field uses, for the explorer's add action.
export function AddModelProviderPopup({ projectPath, onNavigateToOverview }: AddModelProviderPopupProps): null {
    const { addModal, closeModal } = useModalStack();
    const navigateToOverview = useRef(onNavigateToOverview);
    navigateToOverview.current = onNavigateToOverview;

    useEffect(() => {
        const fileName = Utils.joinPath(URI.file(projectPath), CONNECTIONS_FILE).fsPath;
        addModal(
            <ConnectionCreateWizard
                connectionKind="MODEL_PROVIDER"
                fileName={fileName}
                onCreated={() => {
                    closeModal(MODAL_ID);
                    navigateToOverview.current();
                }}
            />,
            MODAL_ID,
            "Add Model Provider",
            780,
            680,
            () => navigateToOverview.current()
        );
        return () => closeModal(MODAL_ID);
    }, [projectPath]);

    return null;
}

export default AddModelProviderPopup;
