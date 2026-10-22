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

import { useState, useRef, ChangeEvent } from "react";
import { Attachment, Command, SkillCommand } from "@wso2/ballerina-core";

export interface AttachmentOptions {
    multiple: boolean;
    acceptResolver: (command: Command | null, skillCommand?: SkillCommand) => string;
    handleAttachmentSelection: (e: ChangeEvent<HTMLInputElement>, command: Command | null, skillCommand?: SkillCommand) => Promise<Attachment[]>;
}

interface UseAttachmentsProps {
    attachmentOptions: AttachmentOptions;
    activeCommand: Command | null;
    activeSkillCommand?: SkillCommand;
}

export function useAttachments({ attachmentOptions, activeCommand, activeSkillCommand }: UseAttachmentsProps) {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // open file input
    function handleAttachClick() {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    }

    // handle user file selection
    async function onAttachmentSelection(e: React.ChangeEvent<HTMLInputElement>) {
        const results = await attachmentOptions.handleAttachmentSelection(e, activeCommand, activeSkillCommand);
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
        setAttachments,
        fileInputRef,
        handleAttachClick,
        onAttachmentSelection,
        removeAttachment,
        removeAllAttachments,
    };
}
