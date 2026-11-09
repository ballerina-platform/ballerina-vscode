/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package org.ballerinalang.langserver.workspace.compilerengine.snapshot;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import java.util.concurrent.CompletableFuture;

/**
 * In-progress snapshot contract for the current compilation cycle.
 * @since 1.7.0
 */
public interface InProgressSnapshot extends SnapshotView {

    /**
     * Returns a future for the semantic model of the given module.
     *
     * @param moduleId the module identifier
     * @param checker the cancellation checker for the request
     * @return a future for the module semantic model
     */
    CompletableFuture<SemanticModel> semanticModel(ModuleId moduleId, CancelChecker checker);

    /**
     * Returns a future for the in-progress package compilation.
     *
     * @param checker the cancellation checker for the request
     * @return a future for the package compilation
     */
    CompletableFuture<PackageCompilation> compilation(CancelChecker checker);
}
