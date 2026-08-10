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

import { ChangeEvent } from "react";
import { DataMapperAttachment } from "./dataMapperAttachment";
import { Attachment, Command, SkillCommand } from "@wso2/ballerina-core";
import { GeneralAttachment } from "./generalAttachment";

/**
 * Allowed file types for text-based commands.
 * Adjust these as needed for your application logic.
 */
const TEXT_BASED_TYPES = [
    "text/plain",
    "text/csv",
    "text/xml",
    "text/markdown",
    "application/json",
    "application/x-yaml",
    "application/xml",
    ".sql",
    ".graphql",
    ".md",
    "",
];

/**
 * Allowed image file types.
 */
const IMAGE_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
];

/**
 * Combined text and image types for general commands.
 * PDFs are included so they can be attached as native document blocks in the chat.
 */
const TEXT_AND_IMAGE_TYPES = [...TEXT_BASED_TYPES, ...IMAGE_TYPES, "application/pdf"];

/**
 * Allowed file types for commands expecting documents/images.
 */
export const DOCUMENT_TYPES = [
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/heic",
    "image/heif",
    "application/pdf",
];

/**
 * Returns a list of valid file types for a given command or skill command.
 */
export const getFileTypesForCommand = (command: Command | null, skillCommand?: SkillCommand): string[] => {
    switch (skillCommand) {
        case SkillCommand.DataMap:
            return DOCUMENT_TYPES;
    }
    switch (command) {
        case Command.TypeCreator:
            return DOCUMENT_TYPES;
        default:
            return TEXT_AND_IMAGE_TYPES;
    }
};

/**
 * Utility to build the string for the 'accept' attribute of <input type="file" />.
 */
export const acceptResolver = (command: Command | null, skillCommand?: SkillCommand): string => {
    return getFileTypesForCommand(command, skillCommand).join(",");
};

/**
 * Dynamically selects an attachment handler based on the command or skill command,
 * then processes and returns the results of uploading the file(s).
 */
export const handleAttachmentSelection = async (
    e: ChangeEvent<HTMLInputElement>,
    command: Command | null,
    skillCommand?: SkillCommand
): Promise<Attachment[]> => {

    const usesDocumentHandler = skillCommand === SkillCommand.DataMap || command === Command.TypeCreator;
    const attachmentHandler = usesDocumentHandler
        ? new DataMapperAttachment()
        : new GeneralAttachment(command);

    return attachmentHandler.handleFileAttach(e);
};
