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

import { useEffect, useMemo, useState } from 'react';
import { ListenerModel, NodePosition, LineRange } from '@wso2/ballerina-core';
import { Typography, ProgressRing, View, ViewContent } from '@wso2/ui-toolkit';
import styled from '@emotion/styled';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import ListenerConfigForm from './Forms/ListenerConfigForm';
import { LoadingContainer } from '../../styles';
import { TopNavigationBar } from '../../../components/TopNavigationBar';
import { TitleBar } from '../../../components/TitleBar';

const Container = styled.div`
    display: "flex";
    flex-direction: "column";
    gap: 10;
    margin: 0 20px 20px 0;
`;

export interface ListenerEditViewProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
}

export function ListenerEditView(props: ListenerEditViewProps) {
    const { projectPath, filePath, position } = props;
    const { rpcClient } = useRpcContext();
    const [listenerModel, setListenerModel] = useState<ListenerModel>(undefined);

    const [saving, setSaving] = useState<boolean>(false);

    /** Remount the form when editing a different listener so React Hook Form state does not leak across listeners. */
    const listenerFormKey = useMemo(
        () =>
            `${filePath}|${position.startLine}|${position.startColumn}|${position.endLine}|${position.endColumn}`,
        [filePath, position.startLine, position.startColumn, position.endLine, position.endColumn]
    );

    useEffect(() => {
        setListenerModel(undefined);
        const lineRange: LineRange = {
            startLine: { line: position.startLine, offset: position.startColumn },
            endLine: { line: position.endLine, offset: position.endColumn },
        };
        rpcClient
            .getServiceDesignerRpcClient()
            .getListenerModelFromCode({ filePath, codedata: { lineRange } })
            .then((res) => {
                console.log("Editing Listener Model: ", res.listener);
                setListenerModel(res.listener);
            });
    }, [filePath, position, rpcClient]);

    const onSubmit = async (value: ListenerModel) => {
        setSaving(true);
        const res = await rpcClient.getServiceDesignerRpcClient().updateListenerSourceCode({ filePath, listener: value });
        rpcClient.getVisualizerRpcClient().goBack();
    }

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar title={listenerModel?.name + " Configuration"} subtitle="Configure Listener" />
            <ViewContent padding>
                {!listenerModel &&
                    <LoadingContainer>
                        <ProgressRing />
                        <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading...</Typography>
                    </LoadingContainer>
                }
                {listenerModel && (
                    <Container>
                        <ListenerConfigForm
                            key={listenerFormKey}
                            listenerModel={listenerModel}
                            onSubmit={onSubmit}
                            formSubmitText={saving ? "Saving..." : "Save"}
                            isSaving={saving}
                        />
                    </Container>
                )}
            </ViewContent>
        </View >
    );
};
