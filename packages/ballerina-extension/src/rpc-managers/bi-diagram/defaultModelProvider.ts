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

import { TextEdit } from "vscode-languageserver-types";

/**
 * The shared WSO2 default provider, as the language server writes it:
 * `final ai:Wso2ModelProvider wso2ModelProvider = check ai:getDefaultModelProvider();`
 *
 * Both halves are required. `getDefaultModelProvider()` alone would also match an edit that merely
 * mentions the call, and the type alone matches a provider the user built against their own
 * endpoint — which needs no Config.toml entry. The module prefix is not pinned, because a file may
 * import `ballerina/ai` under any alias.
 */
const WSO2_PROVIDER_TYPE = /\bWso2ModelProvider\b/;
const DEFAULT_PROVIDER_CALL = /\bgetDefaultModelProvider\s*\(\s*\)/;

/**
 * Whether these edits declare the WSO2 default model provider.
 *
 * A provider declared this way reads its service URL and token from Config.toml, so the caller has
 * to write those entries for the generated code to run. Answered from the edits the language server
 * produced rather than from a probe of the project, so it cannot disagree with what was generated.
 *
 * @param textEdits the edits the language server returned, keyed by file
 * @returns true when some edit declares the default provider
 */
export function declaresDefaultModelProvider(textEdits?: { [key: string]: TextEdit[] }): boolean {
    if (!textEdits) {
        return false;
    }
    return Object.values(textEdits).some((edits) =>
        (edits ?? []).some((edit) => {
            const text = edit?.newText;
            return !!text && WSO2_PROVIDER_TYPE.test(text) && DEFAULT_PROVIDER_CALL.test(text);
        })
    );
}
