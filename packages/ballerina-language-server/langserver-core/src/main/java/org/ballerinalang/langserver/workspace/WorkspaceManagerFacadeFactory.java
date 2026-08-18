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

package org.ballerinalang.langserver.workspace;

import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Project;
import io.ballerina.projects.util.ProjectConstants;
import io.ballerina.projects.util.ProjectPaths;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

/**
 * Factory that assembles a fully-wired {@link WorkspaceManagerFacadeImpl} from a
 * {@link LanguageServerContext}.
 *
 * @since 1.7.0
 */
public final class WorkspaceManagerFacadeFactory {

    private WorkspaceManagerFacadeFactory() {
    }

    /**
     * Creates a new {@link WorkspaceManagerFacadeImpl} backed by a {@link WiringConfiguration}.
     *
     * @param serverContext the language server context
     * @return a fully-wired workspace manager facade
     */
    public static WorkspaceManager create(LanguageServerContext serverContext) {
        BuildOptions buildOptions = BuildOptions.builder()
                .setOffline(CommonUtil.COMPILE_OFFLINE)
                .setSticky(false)
                .build();

        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        DualSnapshotStore snapshotStore = new DualSnapshotStore();
        Duration gracePeriod = Duration.ofMillis(2000);

        WiringConfiguration config = WiringConfiguration.builder()
                .eventBus(eventBus)
                .snapshotStore(snapshotStore)
                .projectLoader((requestUri, kind) -> loadProject(Path.of(requestUri.uri()), buildOptions))
                .gracePeriod(gracePeriod)
                .build();

        return new WorkspaceManagerFacadeImpl(
                config.projectService(),
                config.compilationService(),
                config.executionService(),
                config
        );
    }

    private static Project loadProject(Path filePath, BuildOptions buildOptions) {
        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
        Project project = compilerApi.loadProject(filePath, buildOptions);

        if (compilerApi.hasOptimizedDependencyCompilation(project)) {
            BuildOptions newOptions = BuildOptions.builder()
                    .setOffline(CommonUtil.COMPILE_OFFLINE)
                    .setSticky(false)
                    .build();
            project = compilerApi.loadProject(filePath, newOptions);
        }

        if (!compilerApi.isWorkspaceProject(project) && project.currentPackage().dependenciesToml().isPresent()) {
            BuildOptions newOptions = BuildOptions.builder()
                    .setOffline(CommonUtil.COMPILE_OFFLINE)
                    .setSticky(true)
                    .build();
            project = compilerApi.loadProject(filePath, newOptions);
        }

        if (!compilerApi.isWorkspaceProject(project)) {
            return project;
        }

        Path projectRoot = computeProjectRoot(filePath);
        List<Project> workspacePackages = compilerApi.getWorkspaceProjectsInOrder(project);
        for (Project workspacePackage : workspacePackages) {
            if (workspacePackage.sourceRoot().equals(projectRoot)) {
                return workspacePackage;
            }
        }
        return project;
    }

    private static Path computeProjectRoot(Path path) {
        if (ProjectPaths.isStandaloneBalFile(path)) {
            return path;
        }

        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
        if (compilerApi.isWorkspaceProjectRoot(path)) {
            return path;
        }

        Path parentDir = path.getParent();
        Path fileName = path.getFileName();
        if (fileName != null
                && fileName.toString().equals(ProjectConstants.BALLERINA_TOML)
                && parentDir != null
                && compilerApi.isWorkspaceProjectRoot(parentDir)) {
            return parentDir;
        }

        return ProjectPaths.packageRoot(path);
    }
}
