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

import styled from "@emotion/styled";
import { Codicon, ScrollableContainer, Typography } from "@wso2/ui-toolkit";
import { ThemeColors } from "@wso2/ui-toolkit/lib/styles/Theme";

const PopupFormContainer = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2100;
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 70%, transparent);
    display: flex;
    justify-content: center;
    align-items: center;
`;

const PopupFormBox = styled.div<{ width?: number; height?: number }>`
  width: ${({width}:{width:number}) => (width ? `${width}px` : 'auto')};
  height: ${({height}:{height:number}) => (height ? `${height}px` : 'auto')};
  max-width: 90vw;
  max-height: 90vh;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  border-radius: 10px;
  background-color: ${ThemeColors.SURFACE_DIM};
  box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);
  z-index: 2100;
`;

const PopupFormHeader = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-inline: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

export type PopupFormProps = {
    width?: number;
    height?: number;
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
};


const PopupFormContent = styled.div`
    flex: 1;
    min-height: 0; /* Critical for nested flex scroll areas */
    display: flex;
    flex-direction: column;
    padding-top: 16px;
`;


export const PopupForm = (props: PopupFormProps) => {
    const { width, height, title, children, onClose } = props;

    return (
        <PopupFormContainer>
            <PopupFormBox width={width} height={height}>
                <PopupFormHeader>
                    <Typography
                        variant="h2"
                        sx={{ margin: 0, fontSize: "20px", fontWeight: 600, color: ThemeColors.ON_SURFACE }}
                    >
                        {title}
                    </Typography>
                     <Codicon name="close" onClick={onClose} />
                </PopupFormHeader>
                <PopupFormContent>
                    <ScrollableContainer>{children}</ScrollableContainer>
                </PopupFormContent>
            </PopupFormBox>
        </PopupFormContainer>
    )
}
