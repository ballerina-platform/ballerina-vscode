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

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Codicon } from "@wso2/ui-toolkit";
import { AvailableNode } from "@wso2/ballerina-core";
import { PopupModal } from "../../../components/PopupModal";
import {
    PopupHeader, HeaderTitleContainer, PopupTitle, PopupSubtitle, CloseButton, PopupContent
} from "../Connection/styles";
import {
    Badge, EmptyTemplates, ModalControls, TemplateFilter, TemplateFilters, TemplateIconTile,
    TemplateOption, TemplateOptionContent, TemplateOptionDescription, TemplateOptionHeading,
    TemplateResultsGrid, TemplateSearch, TemplateTags
} from "./styles";
import {
    TemplateFilterKind, getTemplateIcon, getTemplateKind, matchesTemplateFilter, templateNeedsEvalset
} from "./templateUtils";

interface TemplateModalProps {
    templates: AvailableNode[];
    templateLoadError?: string;
    selectedTemplate?: AvailableNode;
    onSelectTemplate: (template: AvailableNode) => void;
    onClose: () => void;
}

export function TemplateModal(props: TemplateModalProps) {
    const { templates, templateLoadError, selectedTemplate, onSelectTemplate, onClose } = props;

    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<TemplateFilterKind>('all');
    const filteredTemplates = useMemo(() => {
        const text = query.trim().toLowerCase();
        return templates.filter(template => {
            const haystack = [template.metadata.label, template.metadata.description, getTemplateKind(template)]
                .join(' ').toLowerCase();
            return matchesTemplateFilter(template, filter) && (!text || haystack.includes(text));
        });
    }, [templates, filter, query]);

    const handleSelect = (template: AvailableNode, close: () => void) => {
        onSelectTemplate(template);
        close();
    };

    return createPortal(
        <PopupModal
            onClose={onClose}
            dismissOnBackdropClick
            dismissOnEscape
            ariaLabelledBy="evaluation-template-dialog-title"
        >
            {(close) => (
                <>
                <PopupHeader>
                    <HeaderTitleContainer>
                        <PopupTitle variant="h2" id="evaluation-template-dialog-title">
                            Browse Evaluation Templates
                        </PopupTitle>
                        <PopupSubtitle variant="body3">
                            {filteredTemplates.length} of {templates.length} templates
                        </PopupSubtitle>
                    </HeaderTitleContainer>
                    <CloseButton appearance="icon" onClick={close} aria-label="Close template browser">
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>

                <ModalControls>
                    <TemplateSearch
                        value={query}
                        placeholder="Search by name, type, or behavior"
                        onChange={setQuery}
                        size={60}
                        autoFocus
                    />
                    <TemplateFilters>
                        {([
                            ['all', 'All'],
                            ['rule-based', 'Rule-based'],
                            ['llm-as-judge', 'LLM-as-Judge'],
                            ['uses-evalset', 'Evalset required'],
                            ['no-evalset', 'Evalset or queries']
                        ] as Array<[TemplateFilterKind, string]>).map(([value, label]) => (
                            <TemplateFilter key={value} type="button" active={filter === value}
                                onClick={() => setFilter(value)}>{label}</TemplateFilter>
                        ))}
                    </TemplateFilters>
                </ModalControls>

                <PopupContent>
                    {templateLoadError ? (
                        <EmptyTemplates>{templateLoadError}</EmptyTemplates>
                    ) : filteredTemplates.length === 0 ? (
                        <EmptyTemplates>No templates match the current search and filters.</EmptyTemplates>
                    ) : (
                        <TemplateResultsGrid>
                            {filteredTemplates.map(template => {
                                const isSelected = selectedTemplate?.codedata.symbol === template.codedata.symbol;
                                return (
                                    <TemplateOption key={template.codedata.symbol} type="button"
                                        selected={isSelected} onClick={() => handleSelect(template, close)}>
                                        <TemplateIconTile size={32} selected={isSelected}>
                                            <Codicon name={getTemplateIcon(template)}
                                                sx={{ display: 'flex', height: 'auto', width: 'auto', cursor: 'pointer' }}
                                                iconSx={{ fontSize: '18px', lineHeight: 1, display: 'block', WebkitTextStroke: '0.4px currentColor' }} />
                                        </TemplateIconTile>
                                        <TemplateOptionContent>
                                            <TemplateOptionHeading>
                                                <span>{template.metadata.label}</span>
                                                {isSelected && <Codicon name="check" />}
                                            </TemplateOptionHeading>
                                            <TemplateOptionDescription>{template.metadata.description}</TemplateOptionDescription>
                                            <TemplateTags>
                                                <Badge>{getTemplateKind(template)}</Badge>
                                                <Badge>{templateNeedsEvalset(template) ? 'Evalset required' : 'Evalset or queries'}</Badge>
                                            </TemplateTags>
                                        </TemplateOptionContent>
                                    </TemplateOption>
                                );
                            })}
                        </TemplateResultsGrid>
                    )}
                </PopupContent>
                </>
            )}
        </PopupModal>,
        document.body
    );
}
