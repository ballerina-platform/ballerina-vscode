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

import styled from "@emotion/styled";
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
import { ServiceCreationView } from "../ServiceDesigner/ServiceCreationView";

const FORM_STEP_MAX_WIDTH = 700;

/**
 * Height the MCP form settles at. Reserved up front so the popup opens at its final size instead of
 * growing once the service init model arrives.
 */
const FORM_MIN_HEIGHT = 560;

/**
 * The form is the same whatever the project already holds, so the package is named outright rather
 * than found in the trigger catalogue. No version: the language server resolves the current one,
 * and its bundled MCP schema defaults to the same variant the catalogue would have pointed at.
 */
const MCP_PACKAGE = { orgName: "ballerina", packageName: "mcp", moduleName: "mcp" };

/** Sits inside the scrollable content so a short window still scrolls instead of clipping. */
const ContentSlot = styled.div`
    flex: 1;
    min-height: ${FORM_MIN_HEIGHT}px;
    display: flex;
    flex-direction: column;
`;

interface AddMcpServicePopupProps {
    projectPath?: string;
    onClose: () => void;
}

export function AddMcpServicePopup({ projectPath, onClose }: AddMcpServicePopupProps) {
    return (
        <PopupModal
            onClose={onClose}
            autoHeight
            maxWidth={FORM_STEP_MAX_WIDTH}
            dismissOnBackdropClick={false}
            dismissOnEscape={false}
        >
            {(close) => (
                <PopupModalStep>
                    <PopupHeader>
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2">MCP Service</PopupTitle>
                            <PopupSubtitle variant="body2">
                                Expose tools to MCP clients over the Streamable HTTP transport
                            </PopupSubtitle>
                        </HeaderTitleContainer>
                        <CloseButton appearance="icon" onClick={close}>
                            <Codicon name="close" />
                        </CloseButton>
                    </PopupHeader>
                    <PopupContent>
                        <ContentSlot>
                            <ServiceCreationView
                                isPopup
                                onCreated={close}
                                projectPath={projectPath}
                                {...MCP_PACKAGE}
                            />
                        </ContentSlot>
                    </PopupContent>
                </PopupModalStep>
            )}
        </PopupModal>
    );
}

export default AddMcpServicePopup;
