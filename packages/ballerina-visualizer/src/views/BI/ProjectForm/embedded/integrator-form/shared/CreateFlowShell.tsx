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

import { ReactNode } from "react";
import styled from "@emotion/styled";
import { Icon } from "@wso2/ui-toolkit";
import { useSuppressAgentStatusOrb } from "../../../../../../components/AgentStatusOrb/shared";
import {
    HeaderRow,
    BackButton,
    HeaderText,
    HeaderTitle,
    HeaderSubtitle,
    FormPanel,
    FormPanelHeader,
    FormBody,
    FormContent,
} from "./FormPageLayout";

/**
 * Definite-height backdrop for the Create flow. Unlike the shared `PageBackdrop`
 * (min-height, page scrolls), this locks the flow to the viewport so the panel
 * body can own its own scroll — letting every screen (chooser, wizard, library)
 * live inside one consistent, bounded frame.
 */
const ShellBackdrop = styled.div<{ fill?: boolean }>`
    height: ${(props: { fill?: boolean }) => (props.fill ? "100%" : "100vh")};
    overflow: hidden;
    padding: 28px 30px 24px;
    box-sizing: border-box;
    background:
        radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--wso2-brand-accent, transparent) 10%, transparent) 0%, transparent 34%),
        radial-gradient(circle at 10% 100%, color-mix(in srgb, var(--wso2-brand-primary, transparent) 8%, transparent) 0%, transparent 40%),
        var(--vscode-editor-background);
`;

const ShellContainer = styled.div`
    max-width: 900px;
    height: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
`;

/** Body slot for screens that manage their own internal scroll (the wizard).
 *  Centers its child on the cross axis so the wizard's capped content column
 *  sits centered, matching the chooser's centered form column. */
const ShellBodyFill = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
`;

export interface CreateFlowShellProps {
    title: string;
    subtitle?: string;
    /** Shows a back button in the header when provided. */
    onBack?: () => void;
    /**
     * When true the body is a plain bounded flex column and the child owns its
     * scrolling (used by the multi-step wizard). Otherwise the body scrolls with
     * width-constrained, centered content (used by the chooser and library form).
     */
    bodyFill?: boolean;
    /**
     * Fills the parent's height (100%) instead of the viewport (100vh). Used when
     * the shell is mounted inside a bounded native visualizer view rather than as
     * the top-level welcome webview, so it doesn't overflow its wrapper.
     */
    fill?: boolean;
    children: ReactNode;
}

/**
 * Shared outer frame for every screen of the unified Create flow. Provides the
 * branded backdrop, the bordered panel, and a consistent header (back + title +
 * subtitle), so moving between the project chooser, the integration wizard, and
 * the library form feels like one continuous flow rather than separate forms.
 */
export function CreateFlowShell({ title, subtitle, onBack, bodyFill, fill, children }: CreateFlowShellProps) {
    // The embedded panels render inside an overview, whose view still counts as
    // orb-worthy — so the shell has to opt out for them.
    useSuppressAgentStatusOrb();

    return (
        <ShellBackdrop fill={fill}>
            <ShellContainer>
                <FormPanel>
                    <FormPanelHeader>
                        <HeaderRow>
                            {onBack && (
                                <BackButton type="button" onClick={onBack} title="Go back">
                                    <Icon
                                        name="arrow-left"
                                        isCodicon
                                        sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                        iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                                    />
                                </BackButton>
                            )}
                            <HeaderText>
                                <HeaderTitle variant="h2">{title}</HeaderTitle>
                                {subtitle && <HeaderSubtitle>{subtitle}</HeaderSubtitle>}
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    {bodyFill ? (
                        <ShellBodyFill>{children}</ShellBodyFill>
                    ) : (
                        <FormBody>
                            <FormContent>{children}</FormContent>
                        </FormBody>
                    )}
                </FormPanel>
            </ShellContainer>
        </ShellBackdrop>
    );
}

export default CreateFlowShell;
