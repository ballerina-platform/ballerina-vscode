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

import { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { ConnectorReference, ConnectorUpgradeAdvice } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button } from "@wso2/ui-toolkit";
import { Banner } from "../../../../components/Banner";

const UPGRADE_MESSAGE = "Service Designer may not work as expected until you update this project's connectors.";
const UPDATING_MESSAGE = "Updating the connector...";
const UPDATE_FAILED_MESSAGE = "Failed to update the connector. Please try again.";
const RELOAD_MESSAGE = "This project's connectors are updated. Reload the window to finish.";
const RELOAD_WINDOW_COMMAND = "workbench.action.reloadWindow";

enum UpgradeStatus {
    IDLE = "idle",
    UPDATING = "updating",
    FAILED = "failed",
}

const BannerWrapper = styled.div`
    margin-bottom: 16px;
`;

interface ConnectorUpgradeBannerProps {
    orgName: string;
    packageName: string;
}

export function ConnectorUpgradeBanner({ orgName, packageName }: ConnectorUpgradeBannerProps) {
    const { rpcClient } = useRpcContext();
    const [advice, setAdvice] = useState<ConnectorUpgradeAdvice | undefined>(undefined);
    const [isReloadPending, setIsReloadPending] = useState<boolean>(false);
    const [status, setStatus] = useState<UpgradeStatus>(UpgradeStatus.IDLE);
    const isMountedRef = useRef(true);

    const fetchAdvice = useCallback(async () => {
        if (!orgName || !packageName) {
            setAdvice(undefined);
            setIsReloadPending(false);
            return;
        }
        const isThisConnector = (item: ConnectorReference) =>
            item.orgName === orgName && item.packageName === packageName;
        try {
            const response = await rpcClient.getServiceDesignerRpcClient().getConnectorUpgradeAdvice({ filePath: "" });
            if (isMountedRef.current) {
                setAdvice(response?.advice?.find(isThisConnector));
                setIsReloadPending(response?.pendingReload?.some(isThisConnector) ?? false);
            }
        } catch (error) {
            console.error(">>> Error fetching connector upgrade advice", error);
        }
    }, [rpcClient, orgName, packageName]);

    useEffect(() => {
        isMountedRef.current = true;
        fetchAdvice();
        return () => {
            isMountedRef.current = false;
        };
    }, [fetchAdvice]);

    const handleUpdate = async () => {
        setStatus(UpgradeStatus.UPDATING);
        try {
            const result = await rpcClient.getServiceDesignerRpcClient().pullConnectorUpgrade({
                orgName: advice.orgName,
                moduleName: advice.moduleName,
                packageName: advice.packageName,
                targetVersion: advice.minSupportedVersion,
                promptReload: true,
            });
            if (!isMountedRef.current) {
                return;
            }
            setStatus(result.success ? UpgradeStatus.IDLE : UpgradeStatus.FAILED);
            if (result.success) {
                fetchAdvice();
            }
        } catch (error) {
            console.error(">>> Error updating connector", error);
            if (isMountedRef.current) {
                setStatus(UpgradeStatus.FAILED);
            }
        }
    };

    const handleReload = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [RELOAD_WINDOW_COMMAND] });
    };

    if (isReloadPending) {
        return (
            <BannerWrapper>
                <Banner
                    variant="info"
                    message={RELOAD_MESSAGE}
                    actions={
                        <Button appearance="primary" onClick={handleReload}>
                            Reload Window
                        </Button>
                    }
                />
            </BannerWrapper>
        );
    }

    if (!advice) {
        return null;
    }

    const isUpdating = status === UpgradeStatus.UPDATING;
    const message = isUpdating ? UPDATING_MESSAGE
        : status === UpgradeStatus.FAILED ? UPDATE_FAILED_MESSAGE : UPGRADE_MESSAGE;

    return (
        <BannerWrapper>
            <Banner
                variant="warning"
                message={message}
                actions={
                    <Button appearance="primary" disabled={isUpdating} onClick={handleUpdate}>
                        Update
                    </Button>
                }
            />
        </BannerWrapper>
    );
}
