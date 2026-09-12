/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React from 'react';
import { prettyDOM, waitFor } from "@testing-library/dom";
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CDModel } from '@wso2/ballerina-core';
import { Diagram } from '../components/Diagram';

// Import sample data
import model1 from '../stories/1-empty.json';
import model2 from '../stories/2-only-automation.json';
import model3 from '../stories/3-simple-service.json';
import model4 from '../stories/4-multiple-services.json';
import model5 from '../stories/5-connection-complex.json';
import model6 from '../stories/6-ai-agent-complex.json';
import model7 from '../stories/7-graphql-complex.json';
import model8 from '../stories/8-multiple-connections-complex.json';
import model9 from '../stories/9-workflow-overlap.json';
import model10 from '../stories/10-workflow-function-port-overlap.json';
import model11 from '../stories/11-stacked-workflows-overlap.json';

// Helper function to convert sample data to CDModel format
function convertToCDModel(sampleData: any): CDModel {
    return {
        automation: sampleData.automation ? {
            ...sampleData.automation,
            connections: sampleData.automation.connections || []
        } : undefined,
        connections: sampleData.connections?.map((conn: any) => ({
            symbol: conn.symbol || conn.name,
            uuid: conn.uuid || conn.id,
            scope: conn.scope || 'GLOBAL',
            location: conn.location || {
                filePath: '',
                startLine: { line: 0, offset: 0 },
                endLine: { line: 0, offset: 0 }
            }
        })) || [],
        listeners: sampleData.listeners?.map((listener: any) => ({
            name: listener.name,
            displayName: listener.displayName || listener.name,
            type: listener.type || 'http:Listener',
            uuid: listener.uuid,
            attachedServices: listener.attachedServices || [],
            location: listener.location || {
                filePath: '',
                startLine: { line: 0, offset: 0 },
                endLine: { line: 0, offset: 0 }
            }
        })) || [],
        services: sampleData.services?.map((service: any) => ({
            name: service.name,
            displayName: service.displayName || service.name,
            type: service.type || 'http:Service',
            uuid: service.uuid,
            remoteFunctions: service.remoteFunctions || [],
            resourceFunctions: service.resourceFunctions || [],
            location: service.location || {
                filePath: '',
                startLine: { line: 0, offset: 0 },
                endLine: { line: 0, offset: 0 }
            }
        })) || [],
        workflows: sampleData.workflows?.map((workflow: any) => ({
            symbol: workflow.symbol || workflow.name,
            kind: workflow.kind,
            uuid: workflow.uuid || workflow.id,
            attachedServices: workflow.attachedServices || [],
            attachedFunctions: workflow.attachedFunctions || [],
            events: workflow.events || [],
            humanTasks: workflow.humanTasks || [],
            activities: workflow.activities || [],
            connections: workflow.connections || [],
            invalidSendDataServices: workflow.invalidSendDataServices || [],
            invalidSendDataFunctions: workflow.invalidSendDataFunctions || [],
            enableFlowModel: workflow.enableFlowModel !== false,
            sortText: workflow.sortText || '',
            location: workflow.location || {
                filePath: '',
                startLine: { line: 0, offset: 0 },
                endLine: { line: 0, offset: 0 }
            }
        })) || []
    };
}

// --- Emotion Style Snapshot Helpers ---

/**
 * Extract Emotion CSS rules from <style data-emotion> tags in the document,
 * filtered to only include rules for classes actually used in the given container.
 */
function getEmotionStyles(container: HTMLElement): string {
    const domContent = container.innerHTML;
    const usedHashes = new Set<string>();
    const hashRegex = /css-([a-z0-9]+)/g;
    let match: RegExpExecArray | null;
    while ((match = hashRegex.exec(domContent)) !== null) {
        usedHashes.add(match[1]);
    }

    // Emotion uses insertRule (speedy mode) so CSS is in styleSheets.cssRules, not textContent
    const relevantRules: string[] = [];
    const styleTags = document.querySelectorAll("style[data-emotion]");
    styleTags.forEach((tag) => {
        if (tag instanceof HTMLStyleElement && tag.sheet) {
            try {
                Array.from(tag.sheet.cssRules).forEach((rule) => {
                    const ruleText = rule.cssText;
                    const ruleHashMatch = /\.css-([a-z0-9]+)/.exec(ruleText);
                    if (ruleHashMatch && usedHashes.has(ruleHashMatch[1])) {
                        relevantRules.push(ruleText);
                    }
                });
            } catch (e) {
                // CORS may block access to cssRules
            }
        }
    });
    return relevantRules.sort().join("\n");
}

function buildHashMap(content: string): Map<string, string> {
    const hashRegex = /css-([a-z0-9]+)/g;
    const seen = new Set<string>();
    const ordered: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = hashRegex.exec(content)) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            ordered.push(match[1]);
        }
    }
    const map = new Map<string, string>();
    ordered.forEach((hash, i) => { map.set(`css-${hash}`, `css-${i}`); });
    return map;
}

function applyHashMap(content: string, hashMap: Map<string, string>): string {
    if (hashMap.size === 0) return content;
    const pattern = new RegExp(
        [...hashMap.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
        'g'
    );
    return content.replace(pattern, (m) => hashMap.get(m) ?? m);
}

async function renderAndCheckSnapshot(model: CDModel, testName: string) {
    const mockProps = {
        onListenerSelect: jest.fn(),
        onServiceSelect: jest.fn(),
        onConnectionSelect: jest.fn(),
        onAutomationSelect: jest.fn(),
        onDiagramClick: jest.fn(),
        onZoomToFit: jest.fn(),
        onFunctionSelect: jest.fn(),
        onDeleteComponent: jest.fn(),
    };

    const dom = render(
        <Diagram project={model} {...mockProps} />
    );

    // Wait for diagram to render
    await waitFor(() => {
        const diagramElements = dom.container.querySelectorAll('[class*="diagram"], svg, canvas');
        expect(diagramElements.length).toBeGreaterThan(0);
    }, { timeout: 10000 });

    // Extract Emotion CSS styles relevant to this render
    const emotionStyles = getEmotionStyles(dom.container);

    const prettyDom = prettyDOM(dom.container, 1000000, {
        filterNode(node) {
            return true;
        },
    });

    expect(prettyDom).toBeTruthy();

    // Remove ANSI color codes from prettyDOM output
    let cleanDom = (prettyDom as string).replace(/\x1b\[\d+m/g, "");

    // Build deterministic hash mapping from DOM (order of first appearance)
    const hashMap = buildHashMap(cleanDom);

    // Sanitization: remove dynamic IDs and non-deterministic attributes
    let sanitizedDom = cleanDom
        .replaceAll(/\s+(marker-end|id|data-linkid|data-nodeid|appearance|aria-label|current-value)="[^"]*"/g, '')
        .replaceAll(/<vscode-button\s+>/g, '<vscode-button>');

    // Apply deterministic hash normalization to both DOM and styles
    sanitizedDom = applyHashMap(sanitizedDom, hashMap);
    const normalizedStyles = applyHashMap(emotionStyles, hashMap);

    // Combine styles + DOM for comprehensive snapshot that captures both structure and styling
    const snapshot = normalizedStyles.trim()
        ? `/* Emotion Styles */\n${normalizedStyles}\n\n/* DOM */\n${sanitizedDom}`
        : sanitizedDom;
    expect(snapshot).toMatchSnapshot(testName);
}

describe('Component Diagram - Snapshot Tests', () => {
    test('renders empty project correctly', async () => {
        const cdModel = convertToCDModel(model1);
        await renderAndCheckSnapshot(cdModel, 'empty-project');
    }, 15000);

    test('renders only automation correctly', async () => {
        const cdModel = convertToCDModel(model2);
        await renderAndCheckSnapshot(cdModel, 'only-automation');
    }, 15000);

    test('renders simple service correctly', async () => {
        const cdModel = convertToCDModel(model3);
        await renderAndCheckSnapshot(cdModel, 'simple-service');
    }, 15000);

    test('renders multiple services correctly', async () => {
        const cdModel = convertToCDModel(model4);
        await renderAndCheckSnapshot(cdModel, 'multiple-services');
    }, 15000);

    test('renders connections complex correctly', async () => {
        const cdModel = convertToCDModel(model5);
        await renderAndCheckSnapshot(cdModel, 'connections-complex');
    }, 15000);

    test('renders ai agent complex correctly', async () => {
        const cdModel = convertToCDModel(model6);
        await renderAndCheckSnapshot(cdModel, 'ai-agent-complex');
    }, 15000);

    test('renders graphql complex correctly', async () => {
        const cdModel = convertToCDModel(model7);
        await renderAndCheckSnapshot(cdModel, 'graphql-complex');
    }, 15000);

    test('renders multiple connections complex correctly', async () => {
        const cdModel = convertToCDModel(model8);
        await renderAndCheckSnapshot(cdModel, 'multiple-connections-complex');
    }, 15000);

    test('renders workflow overlap correctly', async () => {
        const cdModel = convertToCDModel(model9);
        await renderAndCheckSnapshot(cdModel, 'workflow-overlap');
    }, 15000);

    test('renders workflow function-port overlap correctly', async () => {
        const cdModel = convertToCDModel(model10);
        await renderAndCheckSnapshot(cdModel, 'workflow-function-port-overlap');
    }, 15000);

    test('renders stacked workflows overlap correctly', async () => {
        const cdModel = convertToCDModel(model11);
        await renderAndCheckSnapshot(cdModel, 'stacked-workflows-overlap');
    }, 15000);
});
