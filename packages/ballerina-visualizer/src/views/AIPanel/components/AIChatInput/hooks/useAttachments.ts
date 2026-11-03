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

import { useState } from "react";
import { Attachment, Command, SkillCommand } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { MAX_FILE_SIZE, MAX_TOTAL_ATTACHMENT_SIZE } from "../../../utils/attachment/attachmentUtils";
import type { AttachmentPolicy } from "../../../utils/attachment/attachmentManager";

export interface AttachmentOptions {
    multiple: boolean;
    resolveAttachmentPolicy: (command: Command | null, skillCommand?: SkillCommand) => AttachmentPolicy;
}

interface UseAttachmentsProps {
    attachmentOptions: AttachmentOptions;
    activeCommand: Command | null;
    activeSkillCommand?: SkillCommand;
}

export function useAttachments({ attachmentOptions, activeCommand, activeSkillCommand }: UseAttachmentsProps) {
    const { rpcClient } = useRpcContext();
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    // open the host file picker (starts in the current project directory)
    async function handleAttachClick() {
        try {
            const results = await rpcClient.getAiPanelRpcClient().selectAttachmentFiles({
                canSelectMany: attachmentOptions.multiple,
                maxFileSize: MAX_FILE_SIZE,
                maxTotalSize: MAX_TOTAL_ATTACHMENT_SIZE,
                ...attachmentOptions.resolveAttachmentPolicy(activeCommand, activeSkillCommand),
            });
            addAttachments(results);
        } catch (error) {
            console.error("Failed to attach files:", error);
        }
    }

    function addAttachments(results: Attachment[]) {
        setAttachments((prev) => {
            const updated = [...prev];
            results.forEach((newFile) => {
                const existingIndex = updated.findIndex(
                    (existing) => existing.name === newFile.name && existing.content === newFile.content
                );
                if (existingIndex !== -1) {
                    updated.splice(existingIndex, 1);
                }
                updated.push(newFile);
            });
            return updated;
        });
    }

    // remove an attachment
    function removeAttachment(index: number) {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    }

    // remove all attachments
    function removeAllAttachments() {
        setAttachments([]);
    }

    return {
        attachments,
        handleAttachClick,
        removeAttachment,
        removeAllAttachments,
    };
}
