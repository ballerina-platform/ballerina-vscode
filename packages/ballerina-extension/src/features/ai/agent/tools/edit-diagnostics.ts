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

import { checkProjectDiagnostics } from '../../../../rpc-managers/ai-panel/repair-utils';
import { StateMachine } from '../../../../stateMachine';
import { DIAGNOSTICS_TOOL_NAME } from './diagnostics-utils';
import { createEditDiagnosticsReporter as createReporter } from './edit-diagnostics-reporter';
import type { EditDiagnosticsReporter } from './edit-diagnostics-reporter';

export type { EditDiagnosticsReporter } from './edit-diagnostics-reporter';
export { resolveWithin, withEditDiagnostics } from './edit-diagnostics-reporter';

/**
 * Asks the language server for the edited file's package diagnostics through the same request as
 * the diagnostics tool, without its dependency-resolution step: a missing module shows up as the
 * error it is, and the diagnostics tool remains the place that pulls dependencies.
 */
export function createEditDiagnosticsReporter(projectRoot: string): EditDiagnosticsReporter {
    return createReporter(
        projectRoot,
        packageRoot => checkProjectDiagnostics(StateMachine.langClient(), packageRoot),
        DIAGNOSTICS_TOOL_NAME,
    );
}
