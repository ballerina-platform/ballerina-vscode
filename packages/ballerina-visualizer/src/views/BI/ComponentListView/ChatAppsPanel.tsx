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

import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { EVENT_TYPE, MACHINE_VIEW, SCOPE } from "@wso2/ballerina-core";
import { CardGrid, PanelViewMore, Title, TitleWrapper } from "./styles";
import { BodyText } from "../../styles";
import ButtonCard from "../../../components/ButtonCard";
import { OutOfScopeComponentTooltip } from "./componentListUtils";
import { Icon } from "@wso2/ui-toolkit";

interface ChatAppsPanelProps {
    scope: SCOPE;
}

const CHAT_APPS = [
    { id: "telegram", title: "Telegram", icon: <Icon name="bi-telegram" sx={{ color: "#229ED9" }} />, org: "ballerinax", packageName: "telegram", moduleName: "telegram" },
    { id: "whatsapp", title: "WhatsApp", icon: <Icon name="bi-whatsapp" sx={{ color: "#25D366" }} />, org: "ballerinax", packageName: "whatsapp.business", moduleName: "whatsapp.business" },
    { id: "googlechat", title: "Google Chat", icon: <Icon name="bi-google-chat" sx={{ color: "#00AC47" }} />, org: "ballerinax", packageName: "googleapis.chat", moduleName: "googleapis.chat" },
];

export function ChatAppsPanel(props: ChatAppsPanelProps) {
    const { rpcClient } = useRpcContext();
    const isDisabled = props.scope && props.scope !== SCOPE.EVENT_INTEGRATION && props.scope !== SCOPE.ANY;

    const handleClick = async (app: typeof CHAT_APPS[number]) => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceWizard,
                artifactInfo: { org: app.org, packageName: app.packageName, moduleName: app.moduleName },
            },
        });
    };

    return (
        <PanelViewMore disabled={isDisabled}>
            <TitleWrapper>
                <Title variant="h2">Chat Apps</Title>
                <BodyText>Connect messaging apps like WhatsApp, Telegram, and Google Chat to your integration.</BodyText>
            </TitleWrapper>
            <CardGrid>
                {CHAT_APPS.map((app) => (
                    <ButtonCard
                        id={`chat-apps-${app.id}`}
                        key={app.id}
                        icon={app.icon}
                        title={app.title}
                        onClick={() => handleClick(app)}
                        disabled={isDisabled}
                        tooltip={isDisabled ? OutOfScopeComponentTooltip : ""}
                    />
                ))}
            </CardGrid>
        </PanelViewMore>
    );
}
