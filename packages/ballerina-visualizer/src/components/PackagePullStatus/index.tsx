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
import { Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { DownloadIcon } from "../DownloadIcon";

/** What the screen is currently waiting on (or reporting). */
export type PackagePullStatusKind =
    /** A package is being downloaded from Ballerina Central. */
    | "pulling"
    /** Indeterminate work that is not a download, e.g. loading from a local repository. */
    | "working"
    | "success"
    | "error";

/**
 * Which of the two established shapes to render in. The two exist because of the space
 * available, and each keeps the metrics the screens using it already had:
 * - `row`: full-width views (service creation, wizard steps) — icon beside the text.
 * - `column`: narrow side panels and popups (connectors) — larger icon stacked above
 *   centered text.
 */
export type PackagePullStatusLayout = "row" | "column";

const Card = styled.div<{ layout: PackagePullStatusLayout }>`
    display: flex;
    align-items: center;
    gap: 16px;
    ${({ layout }: { layout: PackagePullStatusLayout }) =>
        layout === "row"
            ? `
    flex-direction: row;
    padding: 16px;
    border-radius: 8px;
`
            : `
    flex-direction: column;
`}

    & > svg {
        color: ${ThemeColors.ON_SURFACE};
        ${({ layout }: { layout: PackagePullStatusLayout }) =>
            layout === "row"
                ? `font-size: 24px;`
                : `
        font-size: 32px;
        width: 32px;
        height: 32px;
`}
    }
`;

const RowText = styled(Typography)`
    color: ${ThemeColors.ON_SURFACE};
`;

const ColumnText = styled(Typography)`
    margin-top: 16px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 14px;
    text-align: center;
`;

/** Per-layout icon metrics, preserving what each group of screens already rendered. */
const ICON_SIZE: Record<PackagePullStatusLayout, string> = { row: "18px", column: "28px" };
const DOWNLOAD_ICON_COLOR: Record<PackagePullStatusLayout, string> = {
    row: ThemeColors.ON_SURFACE,
    column: "var(--vscode-progressBar-background)",
};

/** The narrow layouts pinned width/height alongside the font size; the row ones did not. */
function iconSizing(layout: PackagePullStatusLayout) {
    const fontSize = ICON_SIZE[layout];
    return layout === "column" ? { fontSize, width: fontSize, height: fontSize } : { fontSize };
}

interface PackagePullStatusProps {
    kind: PackagePullStatusKind;
    message: string;
    /** Defaults to `row`. */
    layout?: PackagePullStatusLayout;
    /** Optional trailing control, e.g. a Retry or Update Now button. */
    action?: ReactNode;
    /** Set by `styled(PackagePullStatus)` when a screen needs to nudge the card's box. */
    className?: string;
}

/**
 * The card a screen shows while a Ballerina package is being resolved — and to report the
 * outcome. Downloading a package from Central is slow enough that every artifact creation
 * path needs to say so rather than sit on a bare spinner; this is that shared message.
 *
 * The caller owns the surrounding layout (the centering container), its own status state
 * machine and its own wording, since those differ per artifact. Only the card is shared.
 */
export function PackagePullStatus({ kind, message, layout = "row", action, className }: PackagePullStatusProps) {
    return (
        <Card layout={layout} className={className}>
            {kind === "pulling" && <DownloadIcon color={DOWNLOAD_ICON_COLOR[layout]} />}
            {kind === "working" && (
                <Icon name="bi-spinner" sx={{ color: ThemeColors.ON_SURFACE, fontSize: ICON_SIZE[layout] }} />
            )}
            {kind === "success" && (
                <Icon name="bi-success" sx={{ color: ThemeColors.PRIMARY, ...iconSizing(layout) }} />
            )}
            {kind === "error" && <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, ...iconSizing(layout) }} />}
            {layout === "row" ? (
                <RowText variant="body2">{message}</RowText>
            ) : (
                <ColumnText variant="body2">{message}</ColumnText>
            )}
            {action}
        </Card>
    );
}
