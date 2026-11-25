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


import React, { useEffect, useState } from "react";
import { InsertTarget } from "@wso2/ballerina-side-panel";
import { Icon } from "@wso2/ui-toolkit";
import { HelperPaneIconType, getHelperPaneIcon } from "../HelperPaneNew/utils/iconUtils";
import { baseType, DataItem, descendantsWhere, displayPath } from "./useDataTree";
import { S } from "./styles";
import { Arrow, Section, dragProps } from "./tree";

const DOCUMENT_KINDS = [
    { label: "File Document", type: "ai:FileDocument", icon: "bi-doc" },
    { label: "Image Document", type: "ai:ImageDocument", icon: "bi-image" },
    { label: "Audio Document", type: "ai:AudioDocument", icon: "bi-audio" },
];

// Values a document can be made from: a URL, a file path or the content itself.
const DOCUMENT_SOURCE = /^(string|byte\[\]|ai:Url)$/;

const isSourceFor = (documentType: string) => (item: DataItem) =>
    DOCUMENT_SOURCE.test(baseType(item.type)) || baseType(item.type) === documentType;

// A MIME type with a slash is a literal such as image/png; anything else names a string variable.
const metadataOf = (mimeType: string) => {
    const mime = mimeType.trim();
    if (!mime) {
        return "";
    }
    return `, metadata: {mimeType: ${mime.includes("/") ? JSON.stringify(mime) : mime}}`;
};

const asDocument = (content: string, documentType: string, mimeType: string) =>
    `<${documentType}>{content: ${content}${metadataOf(mimeType)}}`;

interface DocumentsSectionProps {
    target?: InsertTarget | null;
    formTakesPrompts: boolean;
    roots: DataItem[];
    childrenOf: (parent: DataItem) => Promise<DataItem[]>;
}

export function DocumentsSection({ target, formTakesPrompts, roots, childrenOf }: DocumentsSectionProps) {
    // The chosen field decides; before one is chosen, any prompt field in the form does.
    const show = target ? !!target.expectedType?.includes("ai:Prompt") : formTakesPrompts;
    const [values, setValues] = useState<DataItem[]>([]);

    useEffect(() => {
        let cancelled = false;
        if (show) {
            const anySource = (item: DataItem) => DOCUMENT_KINDS.some((kind) => isSourceFor(kind.type)(item));
            descendantsWhere(roots, anySource, childrenOf).then(
                (nested) => !cancelled && setValues([...roots.filter(anySource), ...nested])
            );
        }
        return () => {
            cancelled = true;
        };
    }, [show, roots.length]);

    if (!show) {
        return null;
    }
    return (
        <Section title="Documents">
            {DOCUMENT_KINDS.map((kind) => (
                <DocumentKind key={kind.type} kind={kind} sources={values.filter(isSourceFor(kind.type))} onInsert={target?.insert} />
            ))}
        </Section>
    );
}

interface DocumentKindProps {
    kind: (typeof DOCUMENT_KINDS)[number];
    sources: DataItem[];
    onInsert?: (value: string) => void;
}

function DocumentKind({ kind, sources, onInsert }: DocumentKindProps) {
    const [expanded, setExpanded] = useState(false);
    const [mimeType, setMimeType] = useState("");
    const [url, setUrl] = useState("");
    const valueOf = (item: DataItem) => (baseType(item.type) === kind.type ? item.path : asDocument(item.path, kind.type, mimeType));
    const insertUrl = () => {
        if (url.trim()) {
            onInsert?.(asDocument(JSON.stringify(url.trim()), kind.type, mimeType));
            setUrl("");
        }
    };

    return (
        <>
            <S.Row role="treeitem" tabIndex={-1} depth={0} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                <S.Chevron><Arrow direction={expanded ? "down" : "right"} /></S.Chevron>
                <Icon name={kind.icon} sx={{ width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                <S.Name>{kind.label}</S.Name>
            </S.Row>
            {expanded && (
                <S.Children depth={0}>
                    {sources.map((item) => {
                        const value = valueOf(item);
                        return (
                            <S.Row
                                key={item.path}
                                role="treeitem"
                                tabIndex={-1}
                                depth={1}
                                title={value}
                                onClick={() => onInsert?.(value)}
                                {...dragProps(displayPath(item.path), (into) => into.insert(value))}
                            >
                                {getHelperPaneIcon(HelperPaneIconType.VARIABLE, "16px")}
                                <S.Name>{displayPath(item.path)}</S.Name>
                                <S.Type title={item.type}>{item.type}</S.Type>
                            </S.Row>
                        );
                    })}
                    <S.InlineInput
                        depth={1}
                        aria-label="Document URL"
                        placeholder="Paste a URL and press Enter"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && insertUrl()}
                    />
                    <S.InlineInput
                        depth={1}
                        aria-label="MIME Type"
                        placeholder="Optional MIME Type, e.g. image/png"
                        value={mimeType}
                        onChange={(event) => setMimeType(event.target.value)}
                    />
                </S.Children>
            )}
        </>
    );
}
