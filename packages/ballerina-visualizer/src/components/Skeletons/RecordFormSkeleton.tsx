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

import React from "react";
import styled from "@emotion/styled";
import { SkeletonBase } from "./styles";

const Fields = styled.div`
    display: flex;
    flex-direction: column;
    gap: 18px;
`;

const Field = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

// A section's fields sit beside a guide line, as the record form draws them.
const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin-left: 7px;
    padding: 4px 0 4px 16px;
    border-left: 1px solid var(--vscode-tree-indentGuidesStroke);
`;

/** One field as the record form draws it: label and type, description and mode switch, input. */
const FieldSkeleton = ({ labelWidth, withDescription = true }: { labelWidth: string; withDescription?: boolean }) => (
    <Field>
        <Row>
            <SkeletonBase width={labelWidth} height={14} />
            <SkeletonBase width={52} height={14} borderRadius="999px" />
        </Row>
        {withDescription && (
            <Row>
                <SkeletonBase width="55%" height={12} />
                <span style={{ flex: 1 }} />
                <SkeletonBase width={112} height={22} borderRadius="2px" />
            </Row>
        )}
        <SkeletonBase height={28} borderRadius="2px" />
    </Field>
);

/** What the record editor's form view shows while it loads the record. */
export const RecordFormSkeleton = () => (
    <Fields data-testid="record-form-skeleton" aria-busy="true" aria-label="Loading the form">
        <FieldSkeleton labelWidth="22%" />
        <Field>
            <Row>
                <SkeletonBase width={12} height={12} />
                <SkeletonBase width="18%" height={14} />
            </Row>
            <Section>
                <FieldSkeleton labelWidth="16%" withDescription={false} />
            </Section>
        </Field>
        <FieldSkeleton labelWidth="26%" />
    </Fields>
);

/**
 * What a side panel form shows while it loads: the same skeleton, padded as the side panel's form is, so it sits
 * where the fields will appear. Every wait for a connection's form shows this one.
 */
export const FormSkeleton = () => (
    <div style={{ padding: "16px" }}>
        <RecordFormSkeleton />
    </div>
);

export default RecordFormSkeleton;
