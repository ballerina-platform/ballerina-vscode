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

/** Borderless centered wizard column that fills its (now definite-height)
 *  scroll host — see the height-locking effect in the wizard root. A flex
 *  column so the stepper and footer stay pinned while only the step content
 *  between them scrolls. The embedding chrome provides any outer framing. */
export const WizardPage = styled.div<{ embedded?: boolean }>`
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 32px;
    ${({ embedded }: { embedded?: boolean }) =>
        embedded
            ? `
        /* Fill up to a capped column that matches the chooser's content width, and
           let the shell body (align-items: center) center it. Width is set via
           max-width + width:100% rather than auto side margins, which on a flex
           item would collapse it to its content width (making the panel width jump
           per selected type). Content width (≈800px) mirrors the chooser's
           FormContent so the wizard reads as the same column. */
        width: 100%;
        max-width: 864px;
        min-width: 0;
    `
            : `
        max-width: 900px;
        margin: 0 auto;
    `}
`;

/** Row above the step content: step-back icon pinned left, stepper centered. */
export const WizardTopBar = styled.div`
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 20px 0 14px;
    margin-bottom: 10px;
`;

export const BackButtonSlot = styled.div`
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
`;

/** Fills the remaining height below the stepper. Its content — the scroll area
 *  plus the pinned footer — is laid out as a flex column so only the scroll
 *  area moves. */
export const StepBody = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

/** Pinned block above the scroll area (e.g. the integration name + the type
 *  section label) so only the content below it scrolls. */
export const StepPinnedHeader = styled.div`
    flex: 0 0 auto;
`;

/** Section label introducing the scrolling content below the pinned fields. */
export const StepSectionLabel = styled.div`
    font-size: 13px;
    font-weight: 500;
    color: var(--vscode-foreground);
    margin-top: 4px;
    margin-bottom: 32px;
`;

/** The single scrolling region: step content (e.g. the artifact grid) scrolls
 *  here while the stepper above and the footer below stay put.
 *
 *  `fitContent` opts a short step (the Name step) out of stretching, so the
 *  footer sits directly under the field instead of being pushed to the far
 *  bottom of the panel with a large dead gap above it — matching how the
 *  chooser screen's footer follows its content. */
export const StepScrollArea = styled.div<{ fitContent?: boolean }>`
    flex: ${({ fitContent }: { fitContent?: boolean }) => (fitContent ? "0 0 auto" : 1)};
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
    /* Reserve the scrollbar gutter so the content width doesn't shift (and the
       category rail doesn't reflow) when the vertical scrollbar toggles between
       types with more or fewer cards. */
    scrollbar-gutter: stable;
`;
