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
import React from 'react';

import { PRODUCT_INTEGRATOR_ISSUES_URL } from '@wso2/ballerina-core';

export enum ErrorNodeKind {
    Input,
    Output,
    Intermediate,
    Other
}

export interface DataMapperErrorProps {
    errorNodeKind?: ErrorNodeKind;
}

export function RenderingError(props: DataMapperErrorProps) {
    const { errorNodeKind } = props;

    let errorMessage = "A problem occurred while rendering the ";
    switch (errorNodeKind) {
        case ErrorNodeKind.Input:
            errorMessage += "input(s).";
            break;
        case ErrorNodeKind.Output:
            errorMessage += "output.";
            break;
        default:
            errorMessage += "diagram.";
    }

    return (
        <>
            <p>
                {errorMessage}
            </p>
            <p>
                Please raise an issue with the sample code in our <a href={PRODUCT_INTEGRATOR_ISSUES_URL}>issue tracker</a>
            </p>
        </>
    )
}
