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

import React, { useState } from 'react';
import { Button, SidePanelBody, TextArea, Typography } from '@wso2/ui-toolkit';
import { BallerinaRpcClient } from '@wso2/ballerina-rpc-client';
import { FileSelect } from '../style';
import { FileSelector } from '../components/FileSelector';
import { EVENT_TYPE, Type, TypeDataWithReferences } from '@wso2/ballerina-core';
import { XMLToRecord } from '@wso2/ballerina-core';
import styled from '@emotion/styled';
import { set } from 'lodash';

interface RecordFromXmlProps {
    onImport: (types: Type[]) => void;
    rpcClient: BallerinaRpcClient;
    isSaving: boolean;
    setIsSaving: (isSaving: boolean) => void;
    isPopupTypeForm: boolean;
}

namespace S {
    export const Container = styled(SidePanelBody)`
        display: flex;
        flex-direction: column;
        gap: 20px;
    `;

    export const Footer = styled.div<{}>`
        display: flex;
        gap: 8px;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
        margin-top: 8px;
        width: 100%;
    `;
}

export const RecordFromXml = (props: RecordFromXmlProps) => {
    const { onImport, rpcClient, isSaving, setIsSaving, isPopupTypeForm } = props;
    const [xml, setXml] = useState<string>("");
    const [error, setError] = useState<string>("");

    const onXmlUpload = (xml: string) => {
        setXml(xml);
        validateXml(xml);
    }

    const validateXml = (xml: string) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, "text/xml");
            // Check if parsing produced an error node
            if (doc.getElementsByTagName("parsererror").length > 0) {
                throw new Error("Invalid XML");
            }
            setError("");
        } catch (e) {
            setError("Invalid XML format");
        }
    }

    const onXmlChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setXml(event.target.value);
        validateXml(event.target.value);
    }

    const importXmlAsRecord = async () => {
        setIsSaving(true);
        setError("");

        try {
            const resp: TypeDataWithReferences = await rpcClient.getRecordCreatorRpcClient().convertXmlToRecordType({
                xmlValue: xml,
                prefix: ""
            });

            // get the last record
            const lastRecord = resp.types[resp.types.length - 1];
            // get a list  of the records except for the last record
            const otherRecords = resp.types
                .filter((t) => t.type.name !== lastRecord.type.name)
                .map((t) => t.type);

            if (otherRecords.length > 0) {
                await rpcClient.getBIDiagramRpcClient().updateTypes({
                    filePath: 'types.bal',
                    types: otherRecords
                });
                if (!isPopupTypeForm) {
                    await props.rpcClient.getVisualizerRpcClient().openView(
                        { type: EVENT_TYPE.UPDATE_PROJECT_LOCATION, location: { addType: false } }
                    );
                }
            }

            if (lastRecord) {
                onImport([lastRecord.type]);
            }
        } catch (err) {
            setError("Failed to import XML as type.");
            console.error("Error importing XML as type:", err);
        } finally {
            // The success path used to rely on the caller unmounting this form; when it does not
            // (or when `lastRecord` is missing) the spinner never stopped.
            setIsSaving(false);
        }
    }

    return (
        <>
            <FileSelect>
                <FileSelector label="Select XML file" extension="xml" onReadFile={onXmlUpload} />
            </FileSelect>
            <TextArea
                rows={15}
                value={xml}
                onChange={onXmlChange}
                errorMsg={error}
                placeholder='Paste your XML here...'
            />
            <S.Footer>
                <Button onClick={importXmlAsRecord} disabled={!!error || !xml.trim() || isSaving}>
                    {isSaving ? <Typography variant="progress">Importing...</Typography> : "Import"}
                </Button>
            </S.Footer>
        </>
    );
};
