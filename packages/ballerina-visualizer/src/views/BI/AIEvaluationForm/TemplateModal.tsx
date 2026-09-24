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

import { ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Codicon, LinkButton } from "@wso2/ui-toolkit";
import { AvailableNode } from "@wso2/ballerina-core";
import { PopupModal } from "../../../components/PopupModal";
import { RelativeLoader } from "../../../components/RelativeLoader";
import {
    PopupHeader, HeaderTitleContainer, PopupTitle, PopupSubtitle, CloseButton, PopupContent
} from "../Connection/styles";
import {
    Badge, CustomEvaluationPrompt, EmptyTemplates, ModalControls, TemplateFilter, TemplateFilters, TemplateIconTile,
    TemplateOption, TemplateOptionContent, TemplateOptionDescription, TemplateOptionHeading,
    TemplateResultsGrid, TemplateSearch, TemplateTags
} from "./styles";
import {
    TemplateFilterKind, getTemplateIcon, getTemplateKind, matchesTemplateFilter, templateNeedsEvalset
} from "./templateUtils";

interface TemplateBrowserProps {
    templates: AvailableNode[];
    templateLoadError?: string;
    selectedTemplate?: AvailableNode;
    onSelectTemplate: (template: AvailableNode) => void;
    renderHeader?: (visibleCount: number) => ReactNode;
    loading?: boolean;
    /** Offers custom evaluation logic next to the templates. */
    onCustom?: () => void;
}

interface TemplateCardProps {
    template: AvailableNode;
    selected: boolean;
    onSelect: () => void;
}

function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
    return (
        <TemplateOption type="button" selected={selected} onClick={onSelect}>
            <TemplateIconTile size={32} selected={selected}>
                <Codicon name={getTemplateIcon(template)}
                    sx={{ display: 'flex', height: 'auto', width: 'auto', cursor: 'pointer' }}
                    iconSx={{ fontSize: '18px', lineHeight: 1, display: 'block', WebkitTextStroke: '0.4px currentColor' }} />
            </TemplateIconTile>
            <TemplateOptionContent>
                <TemplateOptionHeading>
                    <span>{template.metadata.label}</span>
                    {selected && <Codicon name="check" />}
                </TemplateOptionHeading>
                <TemplateOptionDescription>{template.metadata.description}</TemplateOptionDescription>
                <TemplateTags>
                    <Badge>{getTemplateKind(template)}</Badge>
                    <Badge>{templateNeedsEvalset(template) ? 'Evalset required' : 'Evalset or queries'}</Badge>
                </TemplateTags>
            </TemplateOptionContent>
        </TemplateOption>
    );
}

const TEMPLATE_FILTERS: Array<[TemplateFilterKind, string]> = [
    ['all', 'All'],
    ['rule-based', 'Rule-based'],
    ['llm-as-judge', 'LLM-as-Judge'],
    ['uses-evalset', 'Evalset required'],
    ['no-evalset', 'Evalset or queries']
];

export function TemplateBrowser(props: TemplateBrowserProps) {
    const { templates, templateLoadError, selectedTemplate, onSelectTemplate, renderHeader, loading, onCustom } = props;

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

    const emptyMessage = templateLoadError
        || (filteredTemplates.length === 0 ? 'No templates match the current search and filters.' : undefined);
    const customPrompt = onCustom && (
        <CustomEvaluationPrompt>
            Need a check that isn't listed?
            <LinkButton onClick={onCustom} sx={{ fontSize: 12, padding: 0 }}>
                Write a custom evaluation
            </LinkButton>
        </CustomEvaluationPrompt>
    );

    return (
        <>
            {renderHeader?.(filteredTemplates.length)}
            <ModalControls>
                <TemplateSearch
                    value={query}
                    placeholder="Search by name, type, or behavior"
                    onChange={setQuery}
                    size={60}
                    autoFocus
                />
                <TemplateFilters>
                    {TEMPLATE_FILTERS.map(([value, label]) => (
                        <TemplateFilter key={value} type="button" active={filter === value}
                            onClick={() => setFilter(value)}>{label}</TemplateFilter>
                    ))}
                </TemplateFilters>
            </ModalControls>

            <PopupContent>
                {loading ? <RelativeLoader /> : emptyMessage ? (
                    <EmptyTemplates>
                        {emptyMessage}
                        {customPrompt}
                    </EmptyTemplates>
                ) : (
                    <>
                        <TemplateResultsGrid>
                            {filteredTemplates.map(template => (
                                <TemplateCard
                                    key={template.codedata.symbol}
                                    template={template}
                                    selected={selectedTemplate?.codedata.symbol === template.codedata.symbol}
                                    onSelect={() => onSelectTemplate(template)}
                                />
                            ))}
                        </TemplateResultsGrid>
                        {customPrompt}
                    </>
                )}
            </PopupContent>
        </>
    );
}

interface TemplateModalProps extends Omit<TemplateBrowserProps, 'renderHeader'> {
    onClose: () => void;
}

export function TemplateModal(props: TemplateModalProps) {
    const { templates, onSelectTemplate, onClose } = props;

    return createPortal(
        <PopupModal
            onClose={onClose}
            dismissOnBackdropClick
            dismissOnEscape
            ariaLabelledBy="evaluation-template-dialog-title"
        >
            {(close) => (
                <TemplateBrowser
                    {...props}
                    onSelectTemplate={(template) => {
                        onSelectTemplate(template);
                        close();
                    }}
                    renderHeader={(visibleCount) => (
                        <PopupHeader>
                            <HeaderTitleContainer>
                                <PopupTitle variant="h2" id="evaluation-template-dialog-title">
                                    Browse Evaluation Templates
                                </PopupTitle>
                                <PopupSubtitle variant="body3">
                                    {visibleCount} of {templates.length} templates
                                </PopupSubtitle>
                            </HeaderTitleContainer>
                            <CloseButton appearance="icon" onClick={close} aria-label="Close template browser">
                                <Codicon name="close" />
                            </CloseButton>
                        </PopupHeader>
                    )}
                />
            )}
        </PopupModal>,
        document.body
    );
}
