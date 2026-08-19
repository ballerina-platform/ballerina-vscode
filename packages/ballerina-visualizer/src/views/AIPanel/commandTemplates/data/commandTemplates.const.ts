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

import { TemplateDefinition } from "../models/template.model";
import { AIPanelPrompt, Command, TemplateId } from "@wso2/ballerina-core/";

// All command templates are defined here.
export const commandTemplates = {
    // [Command.Tests]: [
    //     {
    //         id: TemplateId.TestsForService,
    //         text: 'generate tests for <servicename> service',
    //         placeholders: [
    //             {
    //                 id: 'servicename',
    //                 text: '<servicename>',
    //                 multiline: false,
    //             }
    //         ],
    //     },
    //     {
    //         id: TemplateId.TestsForFunction,
    //         text: 'generate tests for resource <method(space)path> function',
    //         placeholders: [
    //             {
    //                 id: 'methodPath',
    //                 text: '<method(space)path>',
    //                 multiline: false,
    //             }
    //         ],
    //     },
    // ],
    [Command.TypeCreator]: [
        {
            id: TemplateId.TypesForAttached,
            text: 'generate types using the attached files',
            placeholders: []
        }
    ],
    // [Command.Healthcare]: [
    //     {
    //         id: TemplateId.Wildcard,
    //         text: '',
    //         placeholders: [],
    //     },
    // ],
    [Command.Ask]: [
        {
            id: TemplateId.Wildcard,
            text: '',
            placeholders: [],
        },
    ],
    [Command.NaturalProgramming]: [

    ],
    [Command.OpenAPI]: [
        {
            id: TemplateId.Wildcard,
            text: '',
            placeholders: [],
        },
    ],
    [Command.Agent]: [
        // Internal use only - agent is the default behavior when no command is specified
    ],
    [Command.Doc]: [
        {
            id: TemplateId.GenerateUserDoc,
            text: 'generate user documentation for <servicename> service',
            placeholders: [
                {
                    id: 'servicename',
                    text: '<servicename>',
                    multiline: false,
                }
            ],
        }
    ],
    // [Command.Compact]: [
    //     {
    //         id: TemplateId.CompactConversation,
    //         text: '',
    //         placeholders: [],
    //     },
    //     {
    //         id: TemplateId.Wildcard,
    //         text: '${instructions}',
    //         placeholders: [{ id: 'instructions', display: 'custom instructions', multiline: false }],
    //     }
    // ]
} as const;

export type CommandTemplates = typeof commandTemplates;

// Natural Programming templates
export const NATURAL_PROGRAMMING_TEMPLATES: TemplateDefinition[] = [
    {
        id: TemplateId.CodeDocDriftCheck,
        text: 'Check drift between code and documentation',
        placeholders: [],
    },
    {
        id: TemplateId.GenerateCodeFromRequirements,
        text: 'Generate code based on the requirements',
        placeholders: [],
    },
    {
        id: TemplateId.GenerateTestFromRequirements,
        text: 'Generate tests against the requirements',
        placeholders: [],
    },
    {
        id: TemplateId.GenerateCodeFromFollowingRequirements,
        text: 'Generate code based on the following requirements: <requirements>',
        placeholders: [
            {
                id: 'requirements',
                text: '<requirements>',
                multiline: true,
            }
        ],
    },
];

// Suggested command templates are defined here.
export const suggestedCommandTemplates: AIPanelPrompt[] = [
    {
        type: "text",
        text: "Write a hello world HTTP service",
        planMode: false,
    },
    {
        type: "text",
        text: "Summarize GitHub Issues and post the summary to a Google Sheet",
        planMode: true,
    },
];

export const agentBuilderSuggestedCommandTemplates: AIPanelPrompt[] = [
    {
        type: "text",
        text: "Create a customer support agent with a chat trigger",
        planMode: true,
    },
    {
        type: "text",
        text: "Add a tool to my agent that calls a REST API",
        planMode: false,
    },
    {
        type: "text",
        text: "Explain what my agent does and which tools it uses",
        planMode: false,
    },
];
