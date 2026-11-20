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

import styled from '@emotion/styled';
import { Button, ThemeColors } from '@wso2/ui-toolkit';
import { FIELD_RADIUS } from './ChipExpressionEditor/constants';

export namespace S {
    export const Container = styled.div({
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontFamily: 'var(--font-family)',
    });

    export const Label = styled.label({
        color: 'var(--vscode-editor-foreground)',
        fontSize: '13px',
        fontWeight: 'bold',
    });

    export const ItemContainer = styled.div({
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    });

    export const Input = styled.input<{ isError?: boolean }>(({ isError }) => ({
        flex: 1,
        padding: '4px 8px',
        border: `1px solid ${ThemeColors.OUTLINE}`,
        borderRadius: FIELD_RADIUS,
        backgroundColor: isError ? 'var(--vscode-inputValidation-errorBackground)' : 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        fontSize: '13px',
        fontFamily: 'var(--vscode-editor-font-family)',
        '&:focus': {
            outline: `1px solid ${ThemeColors.PRIMARY}`,
            borderColor: ThemeColors.PRIMARY,
        },
    }));

    export const DeleteButton = styled(Button)({
        padding: '4px',
        minWidth: 'auto',
        height: 'auto',
    });

    export const AddButton = styled(Button)({
        alignSelf: 'flex-start',
        padding: '4px 8px',
        fontSize: '12px',
    });

    export const IndexContainer = styled.div({
        padding: '4px 8px',
        fontSize: '12px',
        width: '40px',
        height: '23px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: '4px',
        backgroundColor: 'rgba(0, 122, 204, 0.3)'
    });

    export const KeyValueContainer = styled.div({
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flex: 1,
    });
}
