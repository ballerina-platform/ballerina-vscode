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

import React, { ReactNode } from "react";
import styled from "@emotion/styled";
import { PopupForm } from "./Form";
import { InsideModalContext, OVERLAY_ZINDEX_BASE, useOverlayZIndex } from "../../Context";

export type PopupProps = {
    children: ReactNode;
    onClose?: () => void;
    width?: number;
    height?: number;
    title: string;
};

const PopupContentContainer = styled.div`
    position: relative;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
`;



const Popup: React.FC<PopupProps> = ({
    children,
    onClose,
    width,
    height,
    title
}) => {
    const zIndex = useOverlayZIndex() ?? OVERLAY_ZINDEX_BASE;

    return (
        <PopupContentContainer style={{ zIndex }}>
            <PopupForm onClose={onClose} height={height} width={width} title={title} zIndex={zIndex}>
                <InsideModalContext.Provider value={true}>
                    {children}
                </InsideModalContext.Provider>
            </PopupForm>
        </PopupContentContainer>
    );
};

export default Popup;
