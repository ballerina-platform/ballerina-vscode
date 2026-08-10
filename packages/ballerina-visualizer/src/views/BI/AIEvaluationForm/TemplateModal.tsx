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

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { Codicon, ThemeColors } from "@wso2/ui-toolkit";
import { AvailableNode } from "@wso2/ballerina-core";
import {
    PopupOverlay, PopupContainer, PopupHeader, HeaderTitleContainer, PopupTitle, PopupSubtitle,
    CloseButton, PopupContent
} from "../Connection/styles";
import {
    Badge, EmptyTemplates, ModalControls, TemplateFilter, TemplateFilters, TemplateIconTile,
    TemplateOption, TemplateOptionContent, TemplateOptionDescription, TemplateOptionHeading,
    TemplateResultsGrid, TemplateSearch, TemplateTags
} from "./styles";
import {
    TemplateFilterKind, getTemplateIcon, getTemplateKind, matchesTemplateFilter, templateNeedsEvalset
} from "./templateUtils";

const MOTION_MS = 150;

const AnimatedOverlay = styled(PopupOverlay) <{ $closing: boolean }>`
    animation: ${(props: { $closing: boolean }) =>
        `${props.$closing ? 'eval-overlay-out' : 'eval-overlay-in'} ${MOTION_MS}ms ease-out both`};

    @keyframes eval-overlay-in {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes eval-overlay-out {
        from { opacity: 1; }
        to { opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

const AnimatedContainer = styled(PopupContainer) <{ $closing: boolean }>`
    animation: ${(props: { $closing: boolean }) =>
        `${props.$closing ? 'eval-modal-out' : 'eval-modal-in'} ${MOTION_MS}ms ease-out both`};

    @keyframes eval-modal-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.97); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    @keyframes eval-modal-out {
        from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0; transform: translate(-50%, -50%) scale(0.97); }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

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
    const [closing, setClosing] = useState(false);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => () => clearTimeout(closeTimerRef.current), []);

    const handleClose = () => {
        if (closing) {
            return;
        }
        setClosing(true);
        closeTimerRef.current = setTimeout(onClose, MOTION_MS);
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                handleClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [closing]);

    const filteredTemplates = useMemo(() => {
        const text = query.trim().toLowerCase();
        return templates.filter(template => {
            const haystack = [template.metadata.label, template.metadata.description, getTemplateKind(template)]
                .join(' ').toLowerCase();
            return matchesTemplateFilter(template, filter) && (!text || haystack.includes(text));
        });
    }, [templates, filter, query]);

    const handleSelect = (template: AvailableNode) => {
        if (closing) {
            return;
        }
        onSelectTemplate(template);
        handleClose();
    };

    return createPortal(
        <>
            <AnimatedOverlay $closing={closing}
                sx={{ background: `color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 70%, transparent)` }}
                onClose={handleClose} />
            <AnimatedContainer $closing={closing} role="dialog" aria-modal="true"
                aria-labelledby="evaluation-template-dialog-title">
                <PopupHeader>
                    <HeaderTitleContainer>
                        <PopupTitle variant="h2" id="evaluation-template-dialog-title">
                            Browse Evaluation Templates
                        </PopupTitle>
                        <PopupSubtitle variant="body3">
                            {filteredTemplates.length} of {templates.length} templates
                        </PopupSubtitle>
                    </HeaderTitleContainer>
                    <CloseButton appearance="icon" onClick={handleClose} aria-label="Close template browser">
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
                                        selected={isSelected} onClick={() => handleSelect(template)}>
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
            </AnimatedContainer>
        </>,
        document.body
    );
}
