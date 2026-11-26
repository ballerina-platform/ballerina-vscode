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

import { useEffect, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon } from "@wso2/ui-toolkit";
import { PopupModal, PopupModalStep } from "../../../components/PopupModal";
import {
    CloseButton,
    HeaderTitleContainer,
    PopupContent,
    PopupHeader,
    PopupSubtitle,
    PopupTitle,
} from "../Connection/styles";
import { OtherArtifactsPanel } from "../ComponentListView/OtherArtifactsPanel";

interface AddLibraryArtifactPopupProps {
    onClose: () => void;
}

export function AddLibraryArtifactPopup({ onClose }: AddLibraryArtifactPopupProps) {
    const { rpcClient } = useRpcContext();
    const [isNPSupported, setIsNPSupported] = useState(false);

    useEffect(() => {
        rpcClient?.getCommonRpcClient().isNPSupported().then(setIsNPSupported);
    }, [rpcClient]);

    return (
        <PopupModal onClose={onClose} expanded>
            {(close) => (
                <PopupModalStep>
                    <PopupHeader>
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2">Library Artifacts</PopupTitle>
                            <PopupSubtitle variant="body2">Add reusable artifacts to your library</PopupSubtitle>
                        </HeaderTitleContainer>
                        <CloseButton appearance="icon" onClick={close}>
                            <Codicon name="close" />
                        </CloseButton>
                    </PopupHeader>
                    <PopupContent>
                        <OtherArtifactsPanel isNPSupported={isNPSupported} isLibrary hideHeader onCardClick={close} />
                    </PopupContent>
                </PopupModalStep>
            )}
        </PopupModal>
    );
}

export default AddLibraryArtifactPopup;
