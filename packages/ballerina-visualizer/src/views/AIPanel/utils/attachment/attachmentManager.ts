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

import { Command, SelectAttachmentFilesRequest, SkillCommand } from "@wso2/ballerina-core";

export type AttachmentPolicy = Pick<SelectAttachmentFilesRequest, "fileTypes" | "acceptOtherText" | "encoding">;

const TEXT_FILE_TYPES: Record<string, string> = {
    txt: "text/plain",
    log: "text/plain",
    properties: "text/plain",
    proto: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
    bal: "text/x-ballerina",
    json: "application/json",
    avsc: "application/json",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    xml: "application/xml",
    xsd: "application/xml",
    wsdl: "application/xml",
    toml: "application/toml",
    sql: "application/sql",
    graphql: "application/graphql",
};

const IMAGE_FILE_TYPES: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
};

const GENERAL_POLICY: AttachmentPolicy = {
    fileTypes: { ...TEXT_FILE_TYPES, ...IMAGE_FILE_TYPES, pdf: "application/pdf" },
    acceptOtherText: true,
    encoding: "native",
};

const DOCUMENT_POLICY: AttachmentPolicy = {
    fileTypes: {
        txt: "text/plain",
        csv: "text/csv",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        heic: "image/heic",
        heif: "image/heif",
        pdf: "application/pdf",
    },
    acceptOtherText: false,
    encoding: "base64",
};

export const resolveAttachmentPolicy = (command: Command | null, skillCommand?: SkillCommand): AttachmentPolicy => {
    if (skillCommand === SkillCommand.DataMap || command === Command.TypeCreator) {
        return DOCUMENT_POLICY;
    }
    return GENERAL_POLICY;
};
