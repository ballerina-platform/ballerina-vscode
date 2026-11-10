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

import React, { useEffect, useMemo, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentKind } from "@wso2/ballerina-core";
import { Banner } from "@wso2/ui-toolkit";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { ServiceCreationView } from "../ServiceDesigner/ServiceCreationView";
import { GenerateSkillsLink } from "./GenerateSkillsLink";

export interface A2aServerFormProps {
    projectPath: string;
    agentName: string;
    agentOrgName?: string;
    agentKind?: AgentKind;
    orgName: string;
    packageName: string;
    moduleName: string;
    version?: string;
    onCreated: () => void;
}

export function A2aServerForm(props: A2aServerFormProps) {
    const { projectPath, agentName, agentOrgName, agentKind, orgName, packageName, moduleName, version, onCreated } = props;
    const { rpcClient } = useRpcContext();
    const [unsupported, setUnsupported] = useState<string>();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setChecked(false);
        (async () => {
            try {
                const res = await rpcClient.getServiceDesignerRpcClient().getServiceInitModel({
                    filePath: "", orgName, pkgName: packageName, moduleName, listenerName: "", version,
                    isLocalRepository: false, agentName, agentOrgName, agentKind,
                });
                if (!cancelled) {
                    setUnsupported(res?.serviceInitModel?.properties?.unsupportedReason?.value || undefined);
                }
            } catch (e) {
                console.error("Error checking whether the agent can be attached to A2A:", e);
            }
            if (!cancelled) {
                setChecked(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [agentName, agentOrgName, agentKind]);

    const addons = useMemo(
        () => ({ skills: <GenerateSkillsLink projectPath={projectPath} agentName={agentName} /> }),
        [projectPath, agentName]
    );

    if (!checked) {
        return <RelativeLoader />;
    }
    if (unsupported) {
        return <Banner type="warning" message={unsupported} />;
    }
    return (
        <ServiceCreationView
            isPopup
            onCreated={onCreated}
            projectPath={projectPath}
            orgName={orgName}
            packageName={packageName}
            moduleName={moduleName}
            version={version}
            agentName={agentName}
            agentOrgName={agentOrgName}
            agentKind={agentKind}
            fieldAddons={addons}
        />
    );
}

export default A2aServerForm;
