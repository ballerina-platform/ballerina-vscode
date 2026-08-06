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

import { AICommandExecutor, AICommandConfig, AIExecutionResult } from '../base/AICommandExecutor';
import { Command, ProcessContextTypeCreationRequest } from '@wso2/ballerina-core';
import { generateContextTypesCore } from '../../data-mapper/orchestrator';

/**
 * ContextTypesExecutor - Executes context type generation from attachments
 *
 * Features:
 * - Generates Ballerina types from JSON/XML/CSV attachments
 * - Used for creating type definitions
 * - AI-powered type inference
 * - Immediate cleanup (no review mode)
 */
export class ContextTypesExecutor extends AICommandExecutor<ProcessContextTypeCreationRequest> {
    constructor(config: AICommandConfig<ProcessContextTypeCreationRequest>) {
        super(config);
    }

    /**
     * Execute context type generation
     *
     * Flow:
     * 1. Temp project created by base class
     * 2. Call existing generateContextTypesCore with event handler
     * 3. Return modified files
     * 4. Base class handles immediate cleanup
     */
    async execute(): Promise<AIExecutionResult> {
        const tempProjectPath = this.config.executionContext.tempProjectPath!;

        try {
            this.finalizePreviousGeneration();

            // Capture checkpoint BEFORE execution
            this.addGeneration(
                'Generate context types from attachments',
                {
                    operationType: 'context_types',
                    generationType: 'datamapper',
                    commandType: Command.TypeCreator,
                }
            );

            // Call existing core function with params from config and temp path
            const result = await generateContextTypesCore(
                this.config.params,
                this.config.eventHandler,
                this.config.generationId,
                tempProjectPath  // Pass temp project path from base class
            );

            // TODO: emit a review component so these edits get the same revert affordance as agent turns.
            this.settleGeneration('accepted');

            return {
                tempProjectPath,
                modifiedFiles: result.modifiedFiles,
                sourceFiles: result.sourceFiles,
            };
        } catch (error) {
            this.settleGeneration('error');

            // Error handling done by base class in run()
            return {
                tempProjectPath,
                modifiedFiles: [],
                error: error as Error,
            };
        }
    }

    protected getCommandType(): Command {
        return Command.TypeCreator;
    }
}
