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
import { getIntegrationCreationCopy, IntegrationComponentLabel } from "@wso2/ballerina-core";
import { ProgressRing } from "@wso2/ui-toolkit";

const Wrapper = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
`;

const Content = styled.div`
    max-width: 500px;
    padding: 2rem;
    animation: creatingFadeIn 0.4s ease-in-out;
    @keyframes creatingFadeIn {
        0% { opacity: 0; }
        100% { opacity: 1; }
    }
`;

const RingSlot = styled.div`
    display: flex;
    justify-content: center;
`;

const Title = styled.h1`
    color: var(--vscode-foreground);
    font-size: 1.5em;
    font-weight: 400;
    margin: 1.5rem 0 0 0;
    letter-spacing: -0.02em;
    line-height: normal;
    /* Long integration names must not stretch the panel or clip. */
    overflow-wrap: anywhere;
`;

const Subtitle = styled.p`
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    margin: 0.5rem 0 0 0;
    opacity: 0.8;
`;

/**
 * `create` covers the paths that create a package (and may reload the window);
 * `add` covers generating an artifact into a package that already exists and is
 * already open, where there is no name being created and nothing to open.
 */
type CreatingIntegrationViewProps =
    | {
        variant: "create";
        /** Integration being created — the same name the post-reload screen shows. */
        integrationName: string;
        /** e.g. "service"; omit for an empty integration. */
        artifactLabel?: string;
        /** Project it is created in; omit for a standalone package. */
        projectName?: string;
        /** Whether this submit also creates the project. */
        isNewProject?: boolean;
        /** Defaults to "integration". */
        componentLabel?: IntegrationComponentLabel;
    }
    | {
        variant: "add";
        /** e.g. "service" — the artifact being generated. */
        artifactLabel?: string;
    };

/**
 * Replaces the wizard while the final submit is in flight.
 *
 * This is the first half of one continuous progress screen: on the reload paths
 * the extension's startup screen (static HTML, then `LanguageServerLoadingView`)
 * comes up with the same layout, title and wording on the other side of the
 * window reload, so what is really "wizard → blank workbench → visualizer" reads
 * as a single screen that stays put until the integration is ready.
 *
 * The create wording comes from `getIntegrationCreationCopy` so all three screens
 * are worded identically by construction. Neither variant names a step or promises
 * a reload: the submit is a single RPC with no progress signal, and whether the
 * window reloads is the extension's call (it is skipped when the target project is
 * already open), so the wizard cannot honestly say either.
 */
export function CreatingIntegrationView(props: CreatingIntegrationViewProps) {
    const copy = props.variant === "create"
        ? getIntegrationCreationCopy(props)
        : {
            // The add path always carries an artifact, so its fallback is defensive.
            title: `Adding your ${props.artifactLabel ?? "artifact"}`,
            subtitle: `Your new ${props.artifactLabel ?? "artifact"} will appear in the integration once it has been generated.`,
        };
    return (
        <Wrapper>
            <Content>
                <RingSlot>
                    <ProgressRing sx={{ height: 36, width: 36 }} />
                </RingSlot>
                <Title>{copy.title}</Title>
                <Subtitle>{copy.subtitle}</Subtitle>
            </Content>
        </Wrapper>
    );
}
