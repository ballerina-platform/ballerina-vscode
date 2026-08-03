// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { SourceFile, Command, ProcessContextTypeCreationRequest, CodeContext } from "@wso2/ballerina-core";
import { CopilotEventHandler, updateAndSaveChat } from "../utils/events";
import { getErrorMessage, buildChatError } from "../utils/ai-utils";
import { generateTypesFromContext } from "./utils/types-generation";
import { BiDiagramRpcManager } from "../../../rpc-managers/bi-diagram/rpc-manager";
import { StateMachine } from "../../../stateMachine";
import { openAIPanelWithPrompt } from "../../../views/ai-panel/aiMachine";
import path from "path";
import { formatCodeContext } from "../agent/utils";
import { createExecutionContextFromStateMachine } from "../agent";
import { addToIntegration } from "../../../rpc-managers/ai-panel/utils";

// =============================================================================
// CONTEXT TYPE CREATION WITH EVENT HANDLERS
// =============================================================================

// Core context type creation function that emits events and generates Ballerina record types
export async function generateContextTypesCore(
    typeCreationRequest: ProcessContextTypeCreationRequest,
    eventHandler: CopilotEventHandler,
    messageId?: string,
    tempProjectPath?: string
): Promise<{ modifiedFiles: string[], sourceFiles: SourceFile[] }> {
    if (typeCreationRequest.attachments.length === 0) {
        throw new Error("Attachments are required for type creation");
    }

    // Validate temp project path from base class
    if (!tempProjectPath) {
        throw new Error('Temp project path is required');
    }

    const ctx = createExecutionContextFromStateMachine();
    let projectName = path.basename(ctx.projectPath);

    try {
        // Initialize generation process
        eventHandler({ type: "start" });

        const biDiagramRpcManager = new BiDiagramRpcManager();
        const projectComponents = await biDiagramRpcManager.getProjectComponents();
        eventHandler({ type: "content_block", content: "\n\nAnalyzing your provided data to generate Ballerina record types.\n\n" });
        const generatingTypesId = `generating-types_${Date.now()}`;
        eventHandler({ type: "chat_component", componentType: "progress", id: generatingTypesId, data: { text: "Generating types...", status: "start" } });

        let projectRoot = tempProjectPath;
        if (ctx.workspacePath) {
            projectRoot = path.join(projectRoot, projectName);
        }

        // Generate types from context with validation
        const { typesCode, filePath } = await generateTypesFromContext(
            typeCreationRequest.attachments,
            projectComponents,
            projectRoot
        );
        eventHandler({ type: "chat_component", componentType: "progress", id: generatingTypesId, data: { text: "Generating types...", status: "end" } });

        // Adjust file path for workspace projects
        let targetFilePath = filePath;
        if (ctx.workspacePath) {
            targetFilePath = path.join(projectName, filePath);
        }

        // Create source files array
        const sourceFiles: SourceFile[] = [{
            filePath: targetFilePath,
            content: typesCode
        }];
        const modifiedFiles = [targetFilePath];

        if (modifiedFiles.length > 0) {
            const integratingCodeId = `integrating-code_${Date.now()}`;
            eventHandler({ type: "chat_component", componentType: "progress", id: integratingCodeId, data: { text: "Integrating code to workspace...", status: "start" } });
            const workspaceRoot = ctx.workspacePath || ctx.projectPath;
            await addToIntegration(workspaceRoot, [{ filePath: targetFilePath, content: typesCode }]);
            eventHandler({ type: "chat_component", componentType: "progress", id: integratingCodeId, data: { text: "Integrating code to workspace...", status: "end" } });
            console.log(`[DataMapper] Integrated ${modifiedFiles.length} file(s) to workspace`);
            eventHandler({ type: "content_block", content: "\n\nType generation is complete! The generated types have been added to your workspace." });
        }

        // Save chat history before stopping (similar to agent finish handler)
        if (messageId) {
            updateAndSaveChat(messageId, Command.TypeCreator, eventHandler);
        }
        eventHandler({ type: "stop", command: Command.TypeCreator });

        return {
            modifiedFiles,
            sourceFiles
        };
    } catch (error) {
        console.error("Error during context type creation:", error);

        // Enhanced error message for integration failures
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Failed to integrate code')) {
            eventHandler({
                type: "error",
                content: `Integration failed: ${getErrorMessage(error)}\n\nPlease check file permissions and try again.`
            });
        } else {
            eventHandler(buildChatError(error));
        }
        throw error;
    }
}

// Opens the AI panel with data mapper chat interface
export async function openChatWindowWithCommand(): Promise<void> {
    const context = StateMachine.context();
    const { identifier, documentUri } = context;

    let args: string | undefined;
    let tagParams: Record<string, string> | undefined;
    const hiddenParts: string[] = [];
    if (documentUri) { hiddenParts.push(`File: ${documentUri}`); }

    if (identifier) {
        args = `generate mappings for the <functionname> function`;
        tagParams = { functionName: identifier };
        hiddenParts.push(`Mode: function`);
        hiddenParts.push(`Function: ${identifier}`);
    } else {
        try {
            const lineRange = context.dataMapperMetadata?.codeData?.lineRange;
            if (lineRange && documentUri) {
                const codeContext: CodeContext = {
                    type: 'selection',
                    filePath: documentUri,
                    startPosition: { line: lineRange.startLine.line, offset: lineRange.startLine.offset },
                    endPosition: { line: lineRange.endLine.line, offset: lineRange.endLine.offset },
                };
                const snippet = formatCodeContext(codeContext);
                if (snippet) { hiddenParts.push(snippet); }
            }
        } catch (err) {
            console.warn('[openChatWindowWithCommand] Failed to extract code snippet:', err);
        }
        args = "generate mappings using record fields and external values";
        hiddenParts.push(`Mode: inline`);
    }

    openAIPanelWithPrompt({
        type: 'skill',
        skillId: 'data-map',
        skillName: 'data-map',
        ...(args && { args }),
        ...(tagParams && { tagParams }),
        ...(hiddenParts.length > 0 && { hiddenContext: hiddenParts.join('\n') }),
    });
}
