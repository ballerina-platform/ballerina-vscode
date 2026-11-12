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

import React, { Fragment, type ReactNode } from "react";
import styled from "@emotion/styled";
import { CheckBox, Typography } from "@wso2/ui-toolkit";
import type { ParameterModel, PropertyModel } from "@wso2/ballerina-core";

import { type HandlerUnit, type ResolvedSection } from "./handlerLayout";

/*
 * The "Advanced Configurations" box of an MCP tool form. What it shows -- the sections, their order,
 * labels and descriptions, and each parameter's label and description -- comes from the connector's
 * layout metadata, exactly as for any other trigger; only the presentation is MCP's own.
 *
 * Descriptions render as plain text under each checkbox rather than through CheckBox's
 * `sx.description`: that box paints the editor background, which reads as a dark block on the side
 * panel, and its text is interpolated into the checkbox CSS, where an apostrophe breaks the styling.
 */

const Root = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
`;

const SectionDescription = styled.div`
    margin-top: 2px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const Rows = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
`;

const Row = styled.div`
    display: flex;
    flex-direction: column;
`;

// Lines the description up under the checkbox label rather than the box.
const RowDescription = styled.div<{ indented: boolean }>`
    margin-top: 2px;
    padding-left: ${({ indented }: { indented: boolean }) => (indented ? "28px" : "0")};
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    user-select: text;
`;

const RowLabel = styled.div`
    color: var(--vscode-editor-foreground);
`;

const MCP_KINDS: ReadonlySet<HandlerUnit["kind"]> = new Set(["ADVANCED_PARAM", "HEADERS"]);

/** Whether the tool annotation sets `structuredOutput: false`, which mcp.v2 rejects alongside an `outputSchema`. */
function isStructuredOutputOff(toolAnnotation: PropertyModel): boolean {
    const structuredOutput = toolAnnotation.properties?.structuredOutput as PropertyModel | undefined;
    return !!structuredOutput && structuredOutput.enabled !== false && String(structuredOutput.value) === "false";
}

/** Output Schema has no meaning once structured output is Off, so the tool form hides it. */
export function isMcpToolFieldShown(fieldKey: string, toolAnnotation: PropertyModel): boolean {
    return fieldKey !== "outputSchema" || !isStructuredOutputOff(toolAnnotation);
}

/**
 * Clears Output Schema when structured output is turned Off: hiding the field alone would still emit it, and
 * mcp.v2 fails the build on `structuredOutput: false` with an explicit `outputSchema`.
 */
export function withMcpToolRules(toolAnnotation: PropertyModel): PropertyModel {
    const outputSchema = toolAnnotation.properties?.outputSchema as PropertyModel | undefined;
    if (!outputSchema || outputSchema.enabled === false || !isStructuredOutputOff(toolAnnotation)) {
        return toolAnnotation;
    }
    return {
        ...toolAnnotation,
        properties: { ...toolAnnotation.properties, outputSchema: { ...outputSchema, enabled: false } },
    };
}

export interface McpAdvancedSectionProps {
    /** Advanced units outside any labeled section, rendered first with no heading. */
    looseUnits: HandlerUnit[];
    /** The layout's advanced sections, in layout order. */
    sections: ResolvedSection[];
    /** The individually-bound header template; absent when the handler binds no headers. */
    headerTemplate?: ParameterModel;
    /** The existing header list, editor and add button, owned by the parent form. */
    headerControls: ReactNode;
    onParamToggle: (param: ParameterModel, checked: boolean) => void;
    /** Renders any unit kind this section does not present itself, through the shared form. */
    renderOtherUnits: (section: ResolvedSection) => ReactNode[];
}

export function McpAdvancedSection(props: McpAdvancedSectionProps) {
    const { looseUnits, sections, headerTemplate, headerControls, onParamToggle, renderOtherUnits } = props;

    const renderRows = (units: HandlerUnit[]): ReactNode => {
        const rows = units.flatMap((unit): ReactNode[] => {
            if (unit.kind === "ADVANCED_PARAM" && unit.parameter) {
                const param = unit.parameter;
                return [
                    <Row key={`param-${unit.id}`} data-testid={`mcp-param-${unit.id}`}>
                        <CheckBox
                            label={param.metadata?.label}
                            checked={param.enabled}
                            onChange={(checked) => onParamToggle(param, checked)}
                        />
                        {param.metadata?.description && (
                            <RowDescription indented>{param.metadata.description}</RowDescription>
                        )}
                    </Row>,
                ];
            }
            if (unit.kind === "HEADERS" && headerTemplate) {
                return [
                    <Row key="headers" data-testid="mcp-headers">
                        <RowLabel>{headerTemplate.metadata?.label || "HTTP Headers"}</RowLabel>
                        {headerTemplate.metadata?.description && (
                            <RowDescription indented={false}>{headerTemplate.metadata.description}</RowDescription>
                        )}
                        {headerControls}
                    </Row>,
                ];
            }
            return [];
        });
        return rows.length > 0 ? <Rows>{rows}</Rows> : null;
    };

    const renderSection = (section: ResolvedSection): ReactNode => {
        const own = section.units.filter((unit) => MCP_KINDS.has(unit.kind));
        const other = section.units.filter((unit) => !MCP_KINDS.has(unit.kind));
        const rows = renderRows(own);
        const otherNodes = other.length > 0 ? renderOtherUnits({ ...section, units: other }) : [];
        if (!rows && otherNodes.length === 0) {
            return null;
        }
        return (
            <Section key={section.key} data-testid={`mcp-section-${section.key}`}>
                {section.label && <Typography variant="body2" sx={{ margin: 0 }}>{section.label}</Typography>}
                {section.description && <SectionDescription>{section.description}</SectionDescription>}
                {rows}
                {otherNodes.map((node, index) => <Fragment key={`other-${index}`}>{node}</Fragment>)}
            </Section>
        );
    };

    return (
        <Root>
            {looseUnits.length > 0 && <Section>{renderRows(looseUnits)}</Section>}
            {sections.map(renderSection)}
        </Root>
    );
}
