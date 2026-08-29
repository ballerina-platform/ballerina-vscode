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
import { Button } from "@wso2/ui-toolkit";

/** Rendered below the step's scroll area (StepBody keeps it pinned while only
 *  the step content scrolls); back navigation lives in the wizard's top bar. */
const FooterBar = styled.div`
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    padding: 16px 0 16px;
`;

interface WizardFooterProps {
    /** Primary action label ("Next" on the Name and Type steps). Omit to hide the primary button. */
    primaryLabel?: string;
    onPrimary?: () => void;
    primaryDisabled?: boolean;
    /** Skip action — creates an empty integration. Omit to hide. */
    skipLabel?: string;
    onSkip?: () => void;
    skipDisabled?: boolean;
}

/** The wizard's per-step action row: … [Create Empty Integration] [Primary].
 *  The primary action sits last so it lands at the right edge of the form. */
export function WizardFooter(props: WizardFooterProps) {
    const { primaryLabel, onPrimary, primaryDisabled, skipLabel, onSkip, skipDisabled } = props;
    return (
        <FooterBar>
            {skipLabel && onSkip && (
                <Button appearance="secondary" onClick={onSkip} disabled={skipDisabled}>
                    {skipLabel}
                </Button>
            )}
            {primaryLabel && onPrimary && (
                <Button appearance="primary" onClick={onPrimary} disabled={primaryDisabled}>
                    {primaryLabel}
                </Button>
            )}
        </FooterBar>
    );
}
