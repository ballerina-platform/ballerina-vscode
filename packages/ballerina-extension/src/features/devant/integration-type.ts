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

import { AUTOMATION_WITH_LISTENER_WARNING, resolveIntegrationType } from "@wso2/wso2-platform-core";
import { window } from "vscode";

/** Shows the listener warning. Reports whether the user chose to go ahead. */
async function warnListenerRunsAlongside(): Promise<boolean> {
    const choice = await window.showWarningMessage(
        AUTOMATION_WITH_LISTENER_WARNING,
        { modal: true },
        "Continue",
    );
    return choice === "Continue";
}

/**
 * Warns when `chosen` will be deployed with a listener running alongside it, and reports whether
 * the user wants to go ahead. Returns true untouched for every other combination.
 *
 * The consequence it warns about follows from what gets deployed, not from how it was decided, so
 * an entry point that prompts for the type still has to call this — {@link selectIntegrationType}
 * only covers the combinations it settles on its own.
 *
 * Note this warns for exactly the combination {@link resolveIntegrationType} flags, which means
 * automation with no service scope present. Automation picked out of a wider set (say alongside an
 * HTTP service) will not warn, matching every other deploy entry point.
 */
export async function confirmListenerAlongside<T extends string>(scopes: T[], chosen: T): Promise<boolean> {
    const resolution = resolveIntegrationType(scopes);
    if (resolution.kind !== "autoPickWithWarning" || chosen !== resolution.scope) {
        return true;
    }

    return warnListenerRunsAlongside();
}

/**
 * Picks the integration type to deploy from the scopes a package offers, prompting only when
 * {@link resolveIntegrationType} cannot settle on one. Returns undefined when there is nothing to
 * deploy or the user dismissed the prompt, so callers can bail out without dispatching.
 *
 * Generic over the scope enum because `SCOPE` (ballerina-core) and `DevantScopes`
 * (wso2-platform-core) carry identical string values and both reach this from a deploy entry point.
 */
export async function selectIntegrationType<T extends string>(
    integrationTypes: T[],
    placeHolder: string,
): Promise<T | undefined> {
    if (!integrationTypes?.length) {
        return undefined;
    }

    const resolution = resolveIntegrationType(integrationTypes);

    if (resolution.kind === "autoPick") {
        return resolution.scope as T;
    }

    if (resolution.kind === "autoPickWithWarning") {
        return (await warnListenerRunsAlongside()) ? (resolution.scope as T) : undefined;
    }

    const selectedScope = await window.showQuickPick(resolution.choices, { placeHolder });
    return selectedScope as T | undefined;
}
