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
// tslint:disable: jsx-no-multiline-js
import React, { useContext } from 'react';

import { LibraryDataResponse, LibraryInfo } from "@wso2/ballerina-core";
import { GridItem, Icon, Tooltip, Typography } from "@wso2/ui-toolkit";

import { MAX_COLUMN_WIDTH } from '../../../constants';
import { StatementEditorContext } from "../../../store/statement-editor-context";
import { useStmtEditorHelperPanelStyles } from "../../styles";

interface LibraryProps {
    libraryInfo: LibraryInfo,
    key: number,
    libraryBrowsingHandler: (libraryData: LibraryDataResponse) => void
    libraryDataFetchingHandler: (isFetching: boolean, moduleElement?: string) => void
}

export function Library(props: LibraryProps) {
    const { libraryBrowserRpcClient } = useContext(StatementEditorContext);
    const stmtEditorHelperClasses = useStmtEditorHelperPanelStyles();
    const { libraryInfo, key, libraryBrowsingHandler, libraryDataFetchingHandler } = props;
    const { id, orgName, version } = libraryInfo;

    const onClickOnLibrary = async () => {
        libraryDataFetchingHandler(true);
        try {
            const response = await libraryBrowserRpcClient.getLibraryData({
                orgName,
                moduleName: id,
                version
            });

            if (response) {
                libraryBrowsingHandler(response);
            }
        } catch (error) {
            // tslint:disable-next-line: no-console
            console.error("Failed to fetch library data", { orgName, moduleName: id, version, error });
        } finally {
            libraryDataFetchingHandler(false);
        }
    }

    return (
        <GridItem
            key={key}
            id={key}
            onClick={onClickOnLibrary}
            sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: MAX_COLUMN_WIDTH,
                color: 'var(--foreground)'
            }}
        >
            <div className={stmtEditorHelperClasses.suggestionListItem}>
                <Icon name="module-icon" sx={{color: 'var(--vscode-icon-foreground)', margin: '2px 2px 0 0'}} />
                <Tooltip
                    content={id}
                    position="bottom-end"
                >
                    <Typography
                        variant="body3"
                        className={stmtEditorHelperClasses.suggestionValue}
                        data-testid={`library-item-${key}`}
                    >
                        {id}
                    </Typography>
                </Tooltip>
            </div>
        </GridItem>
    );
}
