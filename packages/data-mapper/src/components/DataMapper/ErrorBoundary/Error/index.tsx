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

import React from "react";
import { useErrorBoundary } from "react-error-boundary";

import { useStyles } from "./style";
import { Button, Codicon, Icon } from "@wso2/ui-toolkit";
import { PRODUCT_INTEGRATOR_ISSUES_URL } from "@wso2/ballerina-core";

interface ErrorScreenProps {
    onClose: () => void;
    goToSource: () => void;
}

export default function ErrorScreen(props: ErrorScreenProps) {
    const classes = useStyles();
    const { resetBoundary } = useErrorBoundary();
    const { onClose, goToSource } = props;

    return (
        <>
            <div className={classes.overlay} />
            <div className={classes.errorContainer}>
                <div className={classes.errorBody}>
                    <div className={classes.headerContainer}>
                        <div className={classes.infoIconContainer}>
                            <Codicon iconSx={{ fontSize: 25 }} name="info" />
                        </div>
                        <div className={classes.actionButtons}>
                            <Button appearance="icon" onClick={onClose} tooltip="Close">
                                <Icon name="close" isCodicon sx={{ width: 22, height: 22 }} iconSx={{ fontSize: 20 }} />
                            </Button>
                        </div>
                    </div>
                    <div data-test-id={"error-message"} className={classes.errorMessage}>
                        <p>This mapping cannot be visualized. Please switch to the source view to continue editing.</p>
                        <p>
                            Please raise an issue with the sample code in our <a className={classes.link} href={PRODUCT_INTEGRATOR_ISSUES_URL}>issue tracker.</a>
                        </p>
                    </div>
                    <div className={classes.actionButtons}>
                        <Button appearance="secondary" onClick={resetBoundary}>
                            <Icon name="refresh" isCodicon sx={{ width: 16, height: 16, marginRight: 5 }} iconSx={{ fontSize: 16 }} />
                            Refresh
                        </Button>
                         <Button appearance="primary" onClick={goToSource}>
                            <Icon name="code" isCodicon sx={{ width: 16, height: 16, marginRight: 5 }} iconSx={{ fontSize: 16 }} />
                            Switch To Source
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
