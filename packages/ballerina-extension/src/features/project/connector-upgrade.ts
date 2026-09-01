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

import * as path from 'path';
import { Uri, window } from 'vscode';
import { ConnectorUpgradeAdvice } from '@wso2/ballerina-core';
import { StateMachine } from '../../stateMachine';
import { notifyCurrentWebview } from '../../RPCLayer';

/** {@code CommandConstants.ARG_KEY_DOC_URI} on the LS side -- see PullModuleExecutor.java. */
const ARG_KEY_DOC_URI = 'doc.uri';
const PULL_MODULE_COMMAND = 'PULL_MODULE';

/**
 * Checks the current project for connectors used as a `service ... on <module>:Listener` whose
 * resolved version predates schema-driven trigger support, and prompts for consent to update.
 *
 * Safe (same-minor) bumps are offered as a single "Update All"; a bump that crosses a minor/major
 * boundary (and so may carry a breaking API change, e.g. mcp 1.0.3 -> 1.3.0) is never bundled into
 * that prompt -- each one gets its own explicit warning and consent, one at a time.
 */
export async function checkAndPromptConnectorUpgrades(projectPath: string): Promise<void> {
    if (!projectPath) {
        return;
    }
    let advice: ConnectorUpgradeAdvice[];
    try {
        const response = await StateMachine.langClient().getConnectorUpgradeAdvice({ filePath: projectPath });
        advice = response?.advice ?? [];
    } catch (error) {
        console.error('>>> Error fetching connector upgrade advice', error);
        return;
    }
    if (advice.length === 0) {
        return;
    }

    const safe = advice.filter((item) => !item.breaking);
    const breaking = advice.filter((item) => item.breaking);

    if (safe.length > 0) {
        const summary = safe
            .map((item) => `${item.moduleName} ${item.currentVersion} → ${item.minSupportedVersion}`)
            .join(', ');
        const updateAll = 'Update All';
        const notNow = 'Not Now';
        const selection = await window.showInformationMessage(
            `${safe.length} connector${safe.length > 1 ? 's' : ''} need${safe.length > 1 ? '' : 's'} an update ` +
            `to enable the Service Designer: ${summary}.`,
            updateAll,
            notNow
        );
        if (selection === updateAll) {
            await pullAndBumpConnectors(safe, projectPath);
        }
    }

    for (const item of breaking) {
        const update = 'Update';
        const selection = await window.showWarningMessage(
            `${item.moduleName} ${item.currentVersion} needs to be updated to ${item.minSupportedVersion} to ` +
            `enable the Service Designer. This crosses a version boundary that may require code changes.`,
            update
        );
        if (selection === update) {
            await pullAndBumpConnectors([item], projectPath);
        }
    }
}

/**
 * Triggers the language server's own `PULL_MODULE` command executor (`PullModuleExecutor`,
 * `LSCommandExecutor` SPI, already registered and declared in the LS's `executeCommandProvider`
 * capability -- no new LS API needed) via the standard LSP `workspace/executeCommand` request,
 * already exposed as `ExtendedLangClient.executeCommand`. That executor re-resolves the project
 * non-stickily against Central and refreshes it server-side on success -- no Ballerina.toml/
 * Dependencies.toml edit and no separate `bal build` needed on this side.
 *
 * One invocation re-resolves the whole project (not per-connector), so this fires once using
 * whichever advice item names a source file, falling back to `main.bal`.
 */
export async function pullAndBumpConnectors(
    advice: ConnectorUpgradeAdvice[],
    projectPath: string
): Promise<{ succeeded: ConnectorUpgradeAdvice[]; failed: ConnectorUpgradeAdvice[] }> {
    const targetFile = advice.find((item) => item.usedInFile)?.usedInFile
        ?? path.join(projectPath, 'main.bal');
    const fileUri = Uri.file(path.isAbsolute(targetFile) ? targetFile : path.join(projectPath, targetFile))
        .toString();

    try {
        await StateMachine.langClient().executeCommand({
            command: PULL_MODULE_COMMAND,
            arguments: [{ key: ARG_KEY_DOC_URI, value: fileUri }]
        });
        notifyCurrentWebview();
        return { succeeded: advice, failed: [] };
    } catch (error) {
        console.error('>>> Connector upgrade pull failed', error);
        window.showErrorMessage(
            `Failed to update connector${advice.length > 1 ? 's' : ''}: ` +
            `${advice.map((item) => item.moduleName).join(', ')}.`
        );
        return { succeeded: [], failed: advice };
    }
}
