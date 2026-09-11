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

package org.ballerinalang.langserver.workspace.compilerengine;

import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.SnapshotView;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import javax.annotation.Nonnull;

/**
 * Compilation context service contract.
 *
 * @since 1.7.0
 */
public interface CompilationService {
    /**
     * Returns the stable snapshot for the given package, blocking until one is available.
     *
     * <p>Both {@code project} and {@code descriptor} are required to uniquely identify a
     * compilation unit: the project provides the source root (disambiguating two projects
     * with identical descriptors), while the descriptor identifies the specific package
     * within that project.
     *
     * @param project       the Ballerina project owning the package
     * @param descriptor    the package descriptor identifying the compilation unit
     * @param cancelChecker cancel checker
     * @return stable snapshot, or {@code null} if the package is not tracked
     */
    StableSnapshot stableSnapshot(@Nonnull Project project, @Nonnull PackageDescriptor descriptor,
                                  CancelChecker cancelChecker);

    /**
     * Returns the latest available snapshot view for the given package.
     *
     * <p>Both {@code project} and {@code descriptor} are required to uniquely identify a
     * compilation unit: the project provides the source root (disambiguating two projects
     * with identical descriptors), while the descriptor identifies the specific package
     * within that project.
     *
     * @param project       the Ballerina project owning the package
     * @param descriptor    the package descriptor identifying the compilation unit
     * @param cancelChecker cancel checker
     * @return latest available snapshot view
     */
    SnapshotView latestSnapshot(@Nonnull Project project, @Nonnull PackageDescriptor descriptor,
                                CancelChecker cancelChecker);
}
