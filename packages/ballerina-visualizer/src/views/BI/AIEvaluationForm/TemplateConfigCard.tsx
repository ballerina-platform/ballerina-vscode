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
import { useState } from "react";
import { Codicon, LinkButton, RadioButtonGroup, ThemeColors } from "@wso2/ui-toolkit";
import { FieldFactory, FormField } from "@wso2/ballerina-side-panel";
import { AvailableNode } from "@wso2/ballerina-core";
import { Badge, HintText, SectionLabel, TemplateIconTile, TitleRow } from "./styles";
import { DataSourceMode, DataSourceParam, getTemplateIcon, getTemplateKind, partitionTemplateFields } from "./templateUtils";
import { EvalsetFileControl } from "./EvalsetFileControl";

const Card = styled.div`
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
`;

const Header = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const HeaderContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const Body = styled.div`
    padding: 4px 16px 28px;
`;

const FieldRow = styled.div`
    margin-top: 24px;
`;

const FirstFieldRow = styled(FieldRow)`
    margin-top: 8px;
`;

const FieldAfterTestInput = styled(FieldRow)`
    margin-top: 8px;
`;

const TestInputControls = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;

    > * {
        margin-top: 0;
    }
`;

const OptionalSettings = styled.div`
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const OptionalSettingsHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

interface TemplateConfigCardProps {
    template: AvailableNode;
    templateFields: FormField[];
    dataSourceParam?: DataSourceParam;
    dataSourceMode: DataSourceMode;
    onDataSourceModeChange: (mode: DataSourceMode) => void;
    agentFieldKey?: string;
    evalsetField?: FormField;
    queriesField?: FormField;
    hasEvalsets: boolean;
    selectedEvalsetFile: string;
    onCreateEvalset: () => void;
    onOpenEvalset: (evalsetFile: string) => void;
    onChangeTemplate: () => void;
}

export function TemplateConfigCard(props: TemplateConfigCardProps) {
    const {
        template, templateFields, dataSourceParam, dataSourceMode, onDataSourceModeChange,
        agentFieldKey, evalsetField, queriesField, hasEvalsets, selectedEvalsetFile,
        onCreateEvalset, onOpenEvalset, onChangeTemplate
    } = props;
    const [showOptionalSettings, setShowOptionalSettings] = useState(false);

    const dataSourceField = dataSourceMode === 'queries' ? queriesField : evalsetField;
    const { agentField, requiredFields: requiredTemplateFields, optionalFields: optionalTemplateFields } =
        partitionTemplateFields(templateFields, agentFieldKey);

    return (
        <Card>
            <Header>
                <TemplateIconTile selected>
                    <Codicon name={getTemplateIcon(template)}
                        sx={{ display: 'flex', height: 'auto', width: 'auto' }}
                        iconSx={{ fontSize: '20px', lineHeight: 1, display: 'block', WebkitTextStroke: '0.4px currentColor' }} />
                </TemplateIconTile>
                <HeaderContent>
                    <TitleRow>
                        {template.metadata.label}
                        <Badge>{getTemplateKind(template)}</Badge>
                    </TitleRow>
                    <HintText>{template.metadata.description}</HintText>
                </HeaderContent>
                <LinkButton onClick={onChangeTemplate} sx={{ fontSize: 12, padding: 8, gap: 4 }}>
                    Change Template
                </LinkButton>
            </Header>
            <Body>
                {agentField && (
                    <FirstFieldRow>
                        <FieldFactory field={{ ...agentField, hidden: false }} />
                    </FirstFieldRow>
                )}

                {dataSourceParam && (
                    <FieldRow>
                        <SectionLabel>Test input</SectionLabel>
                        {dataSourceParam.kind === 'union' ? (
                            <HintText>How should test input be provided?</HintText>
                        ) : (
                            <HintText>This template evaluates against an evalset.</HintText>
                        )}
                        <TestInputControls>
                            {dataSourceParam.kind === 'union' && (
                                <RadioButtonGroup
                                    orientation="horizontal"
                                    value={dataSourceMode}
                                    options={[
                                        { id: 'ds-evalset', value: 'evalset', content: 'From an evalset' },
                                        { id: 'ds-queries', value: 'queries', content: 'Enter queries manually' }
                                    ]}
                                    onChange={(e) => onDataSourceModeChange(
                                        e.target.value === 'queries' ? 'queries' : 'evalset')}
                                />
                            )}
                            {dataSourceMode === 'evalset' ? (
                                <EvalsetFileControl
                                    field={dataSourceField}
                                    hasEvalsets={hasEvalsets}
                                    selectedEvalsetFile={selectedEvalsetFile}
                                    emptyState={{
                                        icon: <Codicon name="file" sx={{ fontSize: '16px', width: '16px', height: '16px' }} />,
                                        title: 'No evalset files found',
                                        description: <>
                                            Export traces from a conversation with an agent to create an evalset. You can also
                                            create an empty evalset below
                                            {dataSourceParam.kind === 'union'
                                                ? <>, or choose <strong>Enter queries manually</strong>.</>
                                                : '.'}
                                        </>,
                                        canCreate: true,
                                    }}
                                    onCreateEvalset={onCreateEvalset}
                                    onOpenEvalset={onOpenEvalset}
                                />
                            ) : dataSourceField && (
                                <FieldFactory field={{ ...dataSourceField, hidden: false }} />
                            )}
                        </TestInputControls>
                    </FieldRow>
                )}

                {requiredTemplateFields.map((field, index) => {
                    const Row = dataSourceParam && index === 0 ? FieldAfterTestInput : FieldRow;
                    return (
                        <Row key={field.key}>
                            <FieldFactory field={{ ...field, hidden: false }} />
                        </Row>
                    );
                })}

                {optionalTemplateFields.length > 0 && (
                    <OptionalSettings>
                        <OptionalSettingsHeader>
                            <SectionLabel>Optional settings</SectionLabel>
                            <LinkButton
                                aria-expanded={showOptionalSettings}
                                onClick={() => setShowOptionalSettings(!showOptionalSettings)}
                                sx={{ fontSize: 12, padding: 8, gap: 4 }}
                            >
                                <Codicon name={showOptionalSettings ? "chevron-up" : "chevron-down"}
                                    iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                {showOptionalSettings ? 'Collapse' : 'Expand'}
                            </LinkButton>
                        </OptionalSettingsHeader>
                        {showOptionalSettings && optionalTemplateFields.map(field => (
                            <FieldRow key={field.key}>
                                <FieldFactory field={{ ...field, hidden: false }} />
                            </FieldRow>
                        ))}
                    </OptionalSettings>
                )}
            </Body>
        </Card>
    );
}
