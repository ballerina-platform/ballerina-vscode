/*
 *  Copyright (c) 2020, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
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

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import io.ballerina.projects.ProjectKind;
import io.ballerina.projects.util.ProjectConstants;
import io.ballerina.tools.diagnostics.Diagnostic;
import org.apache.commons.io.FileUtils;
import org.ballerinalang.diagramutil.DiagramUtil;
import org.ballerinalang.langserver.command.executors.RunExecutor;
import org.ballerinalang.langserver.command.executors.StopExecutor;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.ExecuteCommandContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.command.CommandArgument;
import org.ballerinalang.langserver.commons.command.LSCommandExecutorException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.contexts.LanguageServerContextImpl;
import org.ballerinalang.langserver.extensions.ballerina.document.ExecutorPositionsUtil;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.DidCloseTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.LogTraceParams;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.TextDocumentItem;
import org.eclipse.lsp4j.VersionedTextDocumentIdentifier;
import org.eclipse.lsp4j.WorkspaceFolder;
import org.mockito.ArgumentCaptor;
import org.mockito.MockSettings;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import static org.awaitility.Awaitility.await;

/**
 * Contains a set of utility methods to manage projects.
 *
 * @since 1.0.0
 */
public class TestWorkspaceManager {

    private static final Path RESOURCE_DIRECTORY = Path.of("src/test/resources/project");
    private final String dummyContent = "function foo() {" + CommonUtil.LINE_SEPARATOR + "}";
    private final String dummyDidChangeContent = "function foo1() {" + CommonUtil.LINE_SEPARATOR + "}";
    private BallerinaWorkspaceManager workspaceManager;

    @BeforeMethod
    void initWorkspaceManager() {
        // Need to get a clean workspace manager before each test method
        workspaceManager = new BallerinaWorkspaceManager(new LanguageServerContextImpl());
    }

    @AfterClass
    void cleanupWorkspaceManager() {
        workspaceManager = null;
    }

    @Test(dataProvider = "fileOpenUpdateTestDataProvider")
    public void testOpenDocument(Path filePath) throws WorkspaceDocumentException {
        // Inputs from lang server
        openFile(filePath);

        // Assert content
        Optional<Document> document = workspaceManager.document(filePath);
        Assert.assertNotNull(document.get());
        Assert.assertEquals(document.get().syntaxTree().textDocument().toString(), dummyContent);
    }

    @Test(dataProvider = "fileOpenWithDuplicateFilesDataProvider")
    public void testOpenDocumentWithDuplicateFiles(Path filePath) {
        try {
            // Inputs from lang server
            openFile(filePath);
            Assert.fail();
        } catch (Exception e) {
            Assert.assertTrue(e instanceof WorkspaceDocumentException);
            Path projectRoot = workspaceManager.projectRoot(filePath);
            BallerinaWorkspaceManager.ProjectContext projectContext =
                    workspaceManager.sourceRootToProject.get(projectRoot);
            Assert.assertTrue(projectContext == null || projectContext.isProjectCrashed());
        }
    }

    @Test
    public void testOpenNewDuplicateFile() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("pkg_with_generated_sources1")
                .resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);
        Path projectRoot = workspaceManager.projectRoot(filePath);
        BallerinaWorkspaceManager.ProjectContext projectContext =
                workspaceManager.sourceRootToProject.get(projectRoot);
        Assert.assertTrue(projectContext != null && !projectContext.isProjectCrashed());

        // Create a new file and send CREATED event
        Path newFile = RESOURCE_DIRECTORY.resolve("pkg_with_generated_sources1").resolve("modules")
                .resolve("mod1").resolve("mod1.bal").toAbsolutePath();
        Files.deleteIfExists(newFile);
        Files.write(newFile, "int b =10".getBytes());
        try {
            openFile(newFile);
            Assert.fail();
        } catch (Exception e) {
            Assert.assertTrue(e instanceof WorkspaceDocumentException
                    && projectContext.isProjectCrashed());
        } finally {
            Files.deleteIfExists(newFile);
        }
    }

    @Test(dataProvider = "fileOpenUpdateTestDataProvider", dependsOnMethods = "testOpenDocument")
    public void testUpdateDocument(Path filePath) throws WorkspaceDocumentException {
        //Trigger didOpen to create a project instance corresponding to the filePath
        openFile(filePath);

        // Inputs from lang server
        DidChangeTextDocumentParams params = new DidChangeTextDocumentParams();
        VersionedTextDocumentIdentifier doc = new VersionedTextDocumentIdentifier(filePath.toUri().toString(), 1);
        params.setTextDocument(doc);
        params.getContentChanges().add(new TextDocumentContentChangeEvent(dummyDidChangeContent));

        // Notify workspace manager
        workspaceManager.didChange(filePath, params);

        Optional<Document> document = workspaceManager.document(filePath);
        Assert.assertNotNull(document.get());
        Assert.assertEquals(document.get().syntaxTree().textDocument().toString(), dummyDidChangeContent);
    }

    @Test
    public void testWSEventsCreateBalSource() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);
        Module oldModule = workspaceManager.module(filePath).orElseThrow();

        // Create a new file and send CREATED event
        Path newFile = RESOURCE_DIRECTORY.resolve("myproject").resolve("new-file.bal").toAbsolutePath();
        Files.write(newFile, "".getBytes());
        FileEvent fileEvent = new FileEvent(newFile.toUri().toString(), FileChangeType.Created);
        try {
            workspaceManager.didChangeWatched(newFile, fileEvent);
            // Creating new document changes the Module
            Assert.assertNotSame(oldModule, workspaceManager.module(filePath).orElseThrow());
        } finally {
            Files.deleteIfExists(newFile);
        }
    }

    @Test
    public void testWSEventsDeleteBalSource() throws WorkspaceDocumentException, IOException {
        // Create a new file
        Path newFile = RESOURCE_DIRECTORY.resolve("myproject").resolve("delete-file.bal").toAbsolutePath();
        Files.write(newFile, "".getBytes());

        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);
        Module oldModule = workspaceManager.module(filePath).orElseThrow();

        // Delete a file and send DELETED event
        Files.delete(newFile);
        FileEvent fileEvent = new FileEvent(newFile.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(newFile, fileEvent);

        // File deletion forces a new module, modules should not be the same
        Assert.assertNotSame(oldModule, workspaceManager.module(filePath).orElseThrow());
    }

    @Test
    public void testWSEventsDeleteBalSourceOnSingleFileProj() throws WorkspaceDocumentException, IOException {
        // Create a new file
        Path singleFile = RESOURCE_DIRECTORY.resolve("single-file").resolve("delete-file.bal").toAbsolutePath();
        Files.write(singleFile, "".getBytes());

        // Open project
        openFile(singleFile);

        // Delete a file and send DELETED event
        Files.delete(singleFile);
        FileEvent fileEvent = new FileEvent(singleFile.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(singleFile, fileEvent);

        try {
            // File deletion for a single file-project removes the project from mapping
            Files.write(singleFile, "".getBytes()); // need to create file again to not to fail .root() call

            // .project() call should return empty
            Assert.assertTrue(workspaceManager.project(singleFile).isEmpty());
        } finally {
            Files.deleteIfExists(singleFile);
        }
    }

    @Test
    public void testWSEventsCreateBalTomlOnSingleFileProj() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("single-file").resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);

        // Create a Ballerina.toml and send CREATED event
        Path newTomlFile = RESOURCE_DIRECTORY.resolve("single-file").resolve(ProjectConstants.BALLERINA_TOML)
                .toAbsolutePath();
        Files.write(newTomlFile, "".getBytes());
        FileEvent fileEvent = new FileEvent(newTomlFile.toUri().toString(), FileChangeType.Created);
        try {
            workspaceManager.didChangeWatched(newTomlFile, fileEvent);
            Optional<Project> project = workspaceManager.project(filePath);

            // Project should not return empty
            Assert.assertTrue(project.isPresent());
            // Project should be of type BUILD_PROJECT
            Assert.assertSame(project.get().kind(), ProjectKind.BUILD_PROJECT);
        } finally {
            Files.deleteIfExists(newTomlFile);
        }
    }

    @Test
    public void testWSEventsCreateBalTomlOnBuildProj() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("single-file").resolve("main.bal").toAbsolutePath();

        // Create a Ballerina.toml file
        Path tomlFile = RESOURCE_DIRECTORY.resolve("single-file").resolve(ProjectConstants.BALLERINA_TOML)
                .toAbsolutePath();
        Files.write(tomlFile, "[package]\norg = \"sameera\"\nname = \"myproject\"\nversion = \"0.1.0\"".getBytes());

        // Open project
        openFile(filePath);

        // Delete a file and send DELETED event
        Files.delete(tomlFile);
        FileEvent fileEvent = new FileEvent(tomlFile.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(tomlFile, fileEvent);

        // Project should return empty
        Assert.assertTrue(workspaceManager.project(filePath).isEmpty());
    }

    @Test
    public void testWSEventsCreateCloudToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);

        // Create a Cloud.toml and send CREATED event
        Path cloudTomlFile = RESOURCE_DIRECTORY.resolve("myproject").resolve(ProjectConstants.CLOUD_TOML)
                .toAbsolutePath();
        Files.write(cloudTomlFile, "".getBytes());
        FileEvent fileEvent = new FileEvent(cloudTomlFile.toUri().toString(), FileChangeType.Created);
        try {
            workspaceManager.didChangeWatched(cloudTomlFile, fileEvent);

            Optional<Project> project = workspaceManager.project(filePath);
            // Project should not empty
            Assert.assertTrue(project.isPresent());
            // Project should contain Cloud.toml
            Assert.assertTrue(project.get().currentPackage().cloudToml().isPresent());
        } finally {
            Files.deleteIfExists(cloudTomlFile);
        }
    }

    @Test
    public void testWSEventsDeleteCloudToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Create a Cloud.toml file
        Path cloudTomlFile = RESOURCE_DIRECTORY.resolve("myproject").resolve(ProjectConstants.CLOUD_TOML)
                .toAbsolutePath();
        Files.write(cloudTomlFile, "".getBytes());

        // Open project
        openFile(filePath);

        // Delete a file and send DELETED event
        Files.delete(cloudTomlFile);
        FileEvent fileEvent = new FileEvent(cloudTomlFile.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(cloudTomlFile, fileEvent);

        Optional<Project> project = workspaceManager.project(filePath);
        // Project should not empty
        Assert.assertTrue(project.isPresent());
        // Project should not contain Cloud.toml
        Assert.assertTrue(project.get().currentPackage().cloudToml().isEmpty());
    }

    @Test
    public void testWSEventsCreateCompilerPluginToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);

        // Create a Compiler-plugin.toml and send CREATED event
        Path compilerPluginTomlFile = RESOURCE_DIRECTORY.resolve("myproject")
                .resolve(ProjectConstants.COMPILER_PLUGIN_TOML).toAbsolutePath();
        Files.write(compilerPluginTomlFile, "".getBytes());
        FileEvent fileEvent = new FileEvent(compilerPluginTomlFile.toUri().toString(), FileChangeType.Created);
        try {
            workspaceManager.didChangeWatched(compilerPluginTomlFile, fileEvent);

            Optional<Project> project = workspaceManager.project(filePath);
            // Project should not empty
            Assert.assertTrue(project.isPresent());
            // Project should contain Compiler-plugin.toml
            Assert.assertTrue(project.get().currentPackage().compilerPluginToml().isPresent());
        } finally {
            Files.deleteIfExists(compilerPluginTomlFile);
        }
    }

    @Test
    public void testWSEventsDeleteCompilerPluginToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Create a Compiler-plugin.toml file
        Path compilerPluginToml = RESOURCE_DIRECTORY.resolve("myproject").resolve(ProjectConstants.COMPILER_PLUGIN_TOML)
                .toAbsolutePath();
        Files.write(compilerPluginToml, "".getBytes());

        // Open project
        openFile(filePath);

        // Delete a file and send DELETED event
        Files.delete(compilerPluginToml);
        FileEvent fileEvent = new FileEvent(compilerPluginToml.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(compilerPluginToml, fileEvent);

        Optional<Project> project = workspaceManager.project(filePath);
        // Project should not empty
        Assert.assertTrue(project.isPresent());
        // Project should not contain Compiler-plugin.toml
        Assert.assertTrue(project.get().currentPackage().compilerPluginToml().isEmpty());
    }

    @Test
    public void testWSEventsCreateBalToolToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);

        // Create a BalTool.toml and send CREATED event
        Path balToolTomlFile = RESOURCE_DIRECTORY.resolve("myproject")
                .resolve(ProjectConstants.BAL_TOOL_TOML).toAbsolutePath();
        Files.write(balToolTomlFile, "".getBytes());
        FileEvent fileEvent = new FileEvent(balToolTomlFile.toUri().toString(), FileChangeType.Created);
        try {
            workspaceManager.didChangeWatched(balToolTomlFile, fileEvent);

            Optional<Project> project = workspaceManager.project(filePath);
            // Project should not empty
            Assert.assertTrue(project.isPresent());
            // Project should contain BalTool.toml
            Assert.assertTrue(project.get().currentPackage().balToolToml().isPresent());
        } finally {
            Files.deleteIfExists(balToolTomlFile);
        }
    }

    @Test
    public void testWSEventsDeleteBalToolToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Create a Compiler-plugin.toml file
        Path balToolToml = RESOURCE_DIRECTORY.resolve("myproject").resolve(ProjectConstants.BAL_TOOL_TOML)
                .toAbsolutePath();
        Files.write(balToolToml, "".getBytes());

        // Open project
        openFile(filePath);

        // Delete a file and send DELETED event
        Files.delete(balToolToml);
        FileEvent fileEvent = new FileEvent(balToolToml.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(balToolToml, fileEvent);

        Optional<Project> project = workspaceManager.project(filePath);
        // Project should not empty
        Assert.assertTrue(project.isPresent());
        // Project should not contain Compiler-plugin.toml
        Assert.assertTrue(project.get().currentPackage().balToolToml().isEmpty());
    }

    @Test
    public void testWSEventsCreateDependenciesToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);

        // Create a Dependencies.toml and send CREATED event
        Path depsTomlFile = RESOURCE_DIRECTORY.resolve("myproject").resolve(ProjectConstants.DEPENDENCIES_TOML)
                .toAbsolutePath();
        Files.write(depsTomlFile, "".getBytes());
        FileEvent fileEvent = new FileEvent(depsTomlFile.toUri().toString(), FileChangeType.Created);
        try {
            workspaceManager.didChangeWatched(depsTomlFile, fileEvent);

            Optional<Project> project = workspaceManager.project(filePath);
            // Project should not empty
            Assert.assertTrue(project.isPresent());
            // Project should contain Dependencies.toml
            Assert.assertTrue(project.get().currentPackage().dependenciesToml().isPresent());
        } finally {
            Files.deleteIfExists(depsTomlFile);
        }
    }

    @Test
    public void testWSEventsDeleteDependenciesToml() throws WorkspaceDocumentException, IOException {
        Path filePath = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();

        // Create a toml file
        Path depsTomlFile = RESOURCE_DIRECTORY.resolve("myproject").resolve(ProjectConstants.DEPENDENCIES_TOML)
                .toAbsolutePath();
        Files.write(depsTomlFile, "".getBytes());

        // Open project
        openFile(filePath);

        // Delete a file and send DELETED event
        Files.delete(depsTomlFile);
        FileEvent fileEvent = new FileEvent(depsTomlFile.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(depsTomlFile, fileEvent);

        Optional<Project> project = workspaceManager.project(filePath);
        // Project should not empty
        Assert.assertTrue(project.isPresent());
        // Project should not contain Dependencies.toml
        Assert.assertTrue(project.get().currentPackage().dependenciesToml().isEmpty());
    }

    @Test
    public void testWSEventsDeleteModule() throws WorkspaceDocumentException, IOException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("myproject2");
        Path filePath = projectPath.resolve("main.bal").toAbsolutePath();

        // Create a new module with a file
        Path modelsPath = projectPath.resolve(ProjectConstants.MODULES_ROOT).resolve("models").toAbsolutePath();
        Files.createDirectory(modelsPath);
        Path modelFilePath = modelsPath.resolve("model.bal").toAbsolutePath();
        Files.createFile(modelFilePath);

        // Open project
        openFile(filePath);
        Project oldProject = workspaceManager.project(filePath).orElseThrow();

        // Delete a module and send DELETED event
        Files.delete(modelFilePath);
        Files.delete(modelsPath);
        FileEvent fileEvent = new FileEvent(modelsPath.toUri().toString(), FileChangeType.Deleted);
        workspaceManager.didChangeWatched(modelsPath, fileEvent);

        Optional<Project> project = workspaceManager.project(filePath);
        // Project should not be empty
        Assert.assertTrue(project.isPresent());
        // Project should have been reloaded
        Assert.assertNotSame(oldProject, project.get());
    }

    @Test
    public void testWSEventsDeleteModulesDir() throws WorkspaceDocumentException, IOException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("myproject2");
        Path filePath = projectPath.resolve("main.bal").toAbsolutePath();

        // Open project
        openFile(filePath);
        Project oldProject = workspaceManager.project(filePath).orElseThrow();

        Path modulesPath = projectPath.resolve(ProjectConstants.MODULES_ROOT).toAbsolutePath();
        Path modulesPathNew = projectPath.resolve(ProjectConstants.RESOURCE_DIR_NAME).toAbsolutePath();

        // Delete a file and send DELETED event
        Files.move(modulesPath, modulesPathNew);
        FileEvent fileEvent = new FileEvent(modulesPath.toUri().toString(), FileChangeType.Deleted);
        try {
            workspaceManager.didChangeWatched(modulesPath, fileEvent);
            Optional<Project> project = workspaceManager.project(filePath);
            // Project should not be empty
            Assert.assertTrue(project.isPresent());
            // Project should have been reloaded
            Assert.assertNotSame(oldProject, project.get());
        } finally {
            Files.move(modulesPathNew, modulesPath);
        }
    }

    @Test
    public void testWSLoadProject() throws WorkspaceDocumentException, ProjectException, EventSyncException {
        Path filePath1 = RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath();
        Path filePath2 = RESOURCE_DIRECTORY.resolve("myproject2").resolve("main.bal").toAbsolutePath();

        // Projects should not be already in the workspace
        Assert.assertTrue(workspaceManager.project(filePath1).isEmpty());
        Assert.assertTrue(workspaceManager.project(filePath2).isEmpty());

        // Load projects
        Project project1 = workspaceManager.loadProject(filePath1);
        Project project2 = workspaceManager.loadProject(filePath2);

        // Both projects should be loaded
        Assert.assertNotNull(project1);
        Assert.assertNotNull(project2);

        // Loaded project should not be empty
        Optional<Project> project = workspaceManager.project(filePath1);
        Assert.assertTrue(project.isPresent());
    }

    @Test
    public void testWSRunStopProject()
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("long_running");
        Path filePath = projectPath.resolve("main.bal");
        RunResult runResult = executeRunCommand(filePath);
        Assert.assertTrue(runResult.success());
        Assert.assertEquals(runResult.programOutput[0].trim(), "Hello, World!");
        executeStopCommand(projectPath);
    }

    @Test
    public void testWSRunProjectWithCompilationErrors()
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("pkg_with_compilation_errors");
        Path filePath = projectPath.resolve("main.bal");
        RunResult runResult = executeRunCommand(filePath);
        Assert.assertFalse(runResult.success());
        Assert.assertTrue(runResult.errorOutput().length > 0);
        Assert.assertEquals(runResult.errorOutput()[0], "ERROR [main.bal:(5:1,5:1)] missing semicolon token");
        Assert.assertEquals(runResult.errorOutput()[1], "error: compilation contains errors");
        executeStopCommand(projectPath);
    }

    @Test
    public void testSemanticApiAfterWSRun()
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("hello_service");
        Path filePath = projectPath.resolve("main.bal");
        RunResult runResult = executeRunCommand(filePath);
        Assert.assertTrue(runResult.success());

        // Test syntax tree api
        JsonElement syntaxTreeJSON = DiagramUtil.getSyntaxTreeJSON(workspaceManager.document(filePath).orElseThrow(),
                workspaceManager.semanticModel(filePath).orElseThrow());
        // 0 = func def 1 = func def 2 = class def, 3 = listener decl, 4 = service decl
        JsonObject service = syntaxTreeJSON.getAsJsonObject().get("members").getAsJsonArray().get(4).getAsJsonObject();
        Assert.assertEquals(service.get("kind").getAsString(), "ServiceDeclaration");

        // test executor positions api
        JsonArray execPositions = ExecutorPositionsUtil.getExecutorPositions(workspaceManager, filePath);
        Assert.assertEquals(execPositions.getAsJsonArray().get(0).getAsJsonObject().get("name").getAsString(),
                "hello");

        executeStopCommand(projectPath);
    }

    @Test
    public void testSemanticApiAfterWSRunMultiMod()
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException, IOException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("multimod");
        Path filePath = projectPath.resolve("main.bal");

        DidOpenTextDocumentParams params = new DidOpenTextDocumentParams();
        TextDocumentItem textDocument = new TextDocumentItem();
        textDocument.setUri(filePath.toUri().toString());
        textDocument.setText(new String(Files.readAllBytes(filePath)));
        params.setTextDocument(textDocument);
        workspaceManager.didOpen(filePath, params);

        SemanticModel semanticModelPreExec = workspaceManager.semanticModel(filePath).orElseThrow();
        JsonElement syntaxTreeJSONPreExec = DiagramUtil.getSyntaxTreeJSON(
                workspaceManager.document(filePath).orElseThrow(),
                semanticModelPreExec);

        RunResult runResult = executeRunCommand(filePath);
        Assert.assertTrue(runResult.success());

        SemanticModel semanticModelPostExec = workspaceManager.semanticModel(filePath).orElseThrow();
        JsonElement syntaxTreeJSONPostExec = DiagramUtil.getSyntaxTreeJSON(
                workspaceManager.document(filePath).orElseThrow(),
                semanticModelPostExec);

        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        Assert.assertEquals(gson.toJson(syntaxTreeJSONPreExec), gson.toJson(syntaxTreeJSONPostExec));

        executeStopCommand(projectPath);
    }

    private RunResult executeRunCommand(Path filePath)
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        workspaceManager.loadProject(filePath);
        RunExecutor runExecutor = new RunExecutor();
        MockSettings mockSettings = Mockito.withSettings().stubOnly();

        ExecuteCommandContext execContext = createExecutionContextMock(filePath);
        ExtendedLanguageClient languageClient = Mockito.mock(ExtendedLanguageClient.class, mockSettings);
        ArgumentCaptor<LogTraceParams> logCaptor = ArgumentCaptor.forClass(LogTraceParams.class);
        Mockito.doNothing().when(languageClient).logTrace(logCaptor.capture());
        Mockito.when(execContext.getLanguageClient()).thenReturn(languageClient);
        Boolean didRan = runExecutor.execute(execContext);

        return new RunResult(didRan, extractLogs(logCaptor, "out"), extractLogs(logCaptor, "err"));
    }

    private void executeStopCommand(Path projectPath) {
        StopExecutor stopExecutor = new StopExecutor();
        ExecuteCommandContext execContext = createExecutionContextMock(projectPath);
        Boolean didStop = stopExecutor.execute(execContext);
        Assert.assertTrue(didStop);

        Path target = projectPath.resolve("target");
        FileUtils.deleteQuietly(target.toFile());
    }

    private ExecuteCommandContext createExecutionContextMock(Path filePath) {
        MockSettings mockSettings = Mockito.withSettings().stubOnly();
        ExecuteCommandContext execContext = Mockito.mock(ExecuteCommandContext.class, mockSettings);

        CommandArgument javaCmdArg = CommandArgument.from("command", new JsonPrimitive(guessJavaPath()));
        CommandArgument pathArg = CommandArgument.from("path", new JsonPrimitive(filePath.toString()));
        CommandArgument[] args = new CommandArgument[]{javaCmdArg, pathArg};
        Mockito.when(execContext.getArguments()).thenReturn(Arrays.stream(args).toList());
        Mockito.when(execContext.workspace()).thenReturn(workspaceManager);
        return execContext;
    }

    private static String[] extractLogs(ArgumentCaptor<LogTraceParams> logCaptor, String channel) {
        List<LogTraceParams> params = waitGetAllValues(logCaptor);
        return params.stream()
                .filter(param -> param.getVerbose().equals(channel))
                .map(LogTraceParams::getMessage)
                .toArray(String[]::new);
    }

    private static List<LogTraceParams> waitGetAllValues(ArgumentCaptor<LogTraceParams> logCaptor) {
        await().atMost(5, TimeUnit.SECONDS).until(() -> !logCaptor.getAllValues().isEmpty());
        return logCaptor.getAllValues();
    }

    @Test
    public void testWorkspaceProjects() throws WorkspaceDocumentException,
            ExecutionException, InterruptedException {

        Path workspacePath = RESOURCE_DIRECTORY.resolve("workspace");
        Path project1File = workspacePath.resolve("workspace1").resolve("project1")
                .resolve("modules").resolve("mod1").resolve("mod1.bal");
        Path singleFileProject = workspacePath.resolve("workspace2").resolve("single.bal");
        Path project2File = workspacePath.resolve("workspace3").resolve("project2").resolve("main.bal");
        Path project3File = workspacePath.resolve("workspace3").resolve("project3").resolve("main.bal");

        //Mock the ExtendedLanguageClient
        MockSettings mockSettings = Mockito.withSettings().stubOnly();
        ExtendedLanguageClient languageClient = Mockito.mock(ExtendedLanguageClient.class, mockSettings);
        CompletableFuture<List<WorkspaceFolder>> workspaceFolders =
                CompletableFuture.supplyAsync(this::mockWorkspaceFolders);
        Mockito.when(languageClient.workspaceFolders()).thenReturn(workspaceFolders);

        //Create workspace manager
        LanguageServerContextImpl languageServerContext = new LanguageServerContextImpl();
        languageServerContext.put(ExtendedLanguageClient.class, languageClient);
        workspaceManager = new BallerinaWorkspaceManager(languageServerContext);

        //Open the bal files/projects in the workspace
        openFile(project1File);
        openFile(project2File);
        openFile(project3File);
        openFile(singleFileProject);

        //Get and assert response
        Map<Path, Project> pathProjectMap = workspaceManager.workspaceProjects().get();
        Assert.assertEquals(pathProjectMap.size(), 4);
    }

    /**
     * Test opening a file from a workspace project (multi-package workspace). Workspace projects are identified by
     * [workspace] section in Ballerina.toml.
     */
    @Test(description = "Test opening a document in a multi-package workspace project")
    public void testOpenWorkspaceProject() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("main.bal").toAbsolutePath();

        // Open file from workspace project
        openFile(packageAFile);

        // Verify document is loaded
        Optional<Document> document = workspaceManager.document(packageAFile);
        Assert.assertTrue(document.isPresent(), "Document should be present in workspace project");

        // Verify project is loaded
        Optional<Project> project = workspaceManager.project(packageAFile);
        Assert.assertTrue(project.isPresent(), "Project should be loaded from workspace");

        // The loaded project should be a BuildProject (extracted from workspace)
        Assert.assertEquals(project.get().kind(), ProjectKind.BUILD_PROJECT,
                "Workspace package should be loaded as BUILD_PROJECT");
    }

    /**
     * Test opening the root of a workspace project (multi-package workspace).
     */
    @Test(description = "Test opening a document in a multi-package workspace project")
    public void testOpenWorkspaceProjectRoot() throws WorkspaceDocumentException {
        Path workspaceProjectsPath =
                RESOURCE_DIRECTORY.resolve("workspace-projects").resolve("simple-workspace").toAbsolutePath();

        // Open file from workspace project
        openFile(workspaceProjectsPath);
        Optional<Project> project = workspaceManager.project(workspaceProjectsPath);

        Assert.assertTrue(project.isPresent(), "Project should be loaded from workspace");
        Assert.assertEquals(project.get().kind(), ProjectKind.WORKSPACE_PROJECT,
                "Workspace root should be loaded as WORKSPACE_PROJECT");
    }

    /**
     * Test opening multiple packages from the same workspace. Each package should be cached separately but recognized
     * as part of the same workspace.
     */
    @Test(description = "Test opening multiple packages in a workspace project")
    public void testOpenMultiplePackagesInWorkspace() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("main.bal").toAbsolutePath();
        Path packageBFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-b").resolve("main.bal").toAbsolutePath();

        // Open files from both packages in the workspace
        openFile(packageAFile);
        openFile(packageBFile);

        // Verify both documents are loaded
        Assert.assertTrue(workspaceManager.document(packageAFile).isPresent(),
                "Package A document should be loaded");
        Assert.assertTrue(workspaceManager.document(packageBFile).isPresent(),
                "Package B document should be loaded");

        // Each package has its own project root
        Path rootA = workspaceManager.projectRoot(packageAFile);
        Path rootB = workspaceManager.projectRoot(packageBFile);
        Assert.assertNotEquals(rootA, rootB,
                "Different packages should have different project roots");

        // But both are under the same workspace directory
        Assert.assertEquals(rootA.getParent(), rootB.getParent(),
                "Both packages should be under the same workspace directory");
    }

    /**
     * Test that workspace projects with compilation errors are handled correctly.
     */
    @Test(description = "Test workspace project with compilation errors")
    public void testWorkspaceProjectWithErrors() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path errorPackageFile = workspaceProjectsPath.resolve("workspace-with-errors")
                .resolve("pkg1").resolve("main.bal").toAbsolutePath();

        // Open file from package with errors
        openFile(errorPackageFile);

        // Document should still be loaded even with compilation errors
        Optional<Document> document = workspaceManager.document(errorPackageFile);
        Assert.assertTrue(document.isPresent(),
                "Document should be loaded even with compilation errors");

        // Project should be loaded
        Optional<Project> project = workspaceManager.project(errorPackageFile);
        Assert.assertTrue(project.isPresent(),
                "Project should be loaded even with compilation errors");
    }

    /**
     * Test updating a document in a workspace project.
     */
    @Test(description = "Test updating a document in a workspace project")
    public void testUpdateWorkspaceDocument() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("main.bal").toAbsolutePath();

        // Open the file first
        openFile(packageAFile);

        // Update the document
        DidChangeTextDocumentParams params = new DidChangeTextDocumentParams();
        VersionedTextDocumentIdentifier doc = new VersionedTextDocumentIdentifier(
                packageAFile.toUri().toString(), 1);
        params.setTextDocument(doc);
        params.getContentChanges().add(new TextDocumentContentChangeEvent(dummyDidChangeContent));

        workspaceManager.didChange(packageAFile, params);

        // Verify the change
        Optional<Document> document = workspaceManager.document(packageAFile);
        Assert.assertTrue(document.isPresent(), "Document should be present after update");
        Assert.assertEquals(document.get().syntaxTree().textDocument().toString(),
                dummyDidChangeContent, "Document content should be updated");
    }

    /**
     * Test diagnostics scoping in workspace projects.
     */
    @Test(description = "Test diagnostics are scoped to correct package in workspace")
    public void testWorkspaceProjectDiagnostics() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path errorPackageFile = workspaceProjectsPath.resolve("workspace-with-errors")
                .resolve("pkg1").resolve("main.bal").toAbsolutePath();
        Path validPackageFile = workspaceProjectsPath.resolve("workspace-with-errors")
                .resolve("pkg2").resolve("service.bal").toAbsolutePath();

        // Open both files
        openFile(errorPackageFile);
        openFile(validPackageFile);

        // Verify both documents are loaded
        Assert.assertTrue(workspaceManager.document(errorPackageFile).isPresent(),
                "Error package document should be loaded");
        Assert.assertTrue(workspaceManager.document(validPackageFile).isPresent(),
                "Valid package document should be loaded");

        // Verify they are in the same workspace but have different project roots
        Path rootError = workspaceManager.projectRoot(errorPackageFile);
        Path rootValid = workspaceManager.projectRoot(validPackageFile);
        Assert.assertNotEquals(rootError, rootValid, "Different packages should have different project roots");
        Assert.assertEquals(rootError.getParent(), rootValid.getParent(),
                "Both packages should be under the same workspace directory");
    }

    /**
     * Test document lifecycle with workspace project isolation.
     */
    @Test(description = "Test document close maintains package isolation")
    public void testDocumentLifecycleWithIsolation() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("main.bal").toAbsolutePath();
        Path packageBFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-b").resolve("main.bal").toAbsolutePath();

        // Open both files
        openFile(packageAFile);
        openFile(packageBFile);

        // Close package A document in the editor
        DidCloseTextDocumentParams closeParams = new DidCloseTextDocumentParams();
        closeParams.setTextDocument(new TextDocumentIdentifier(packageAFile.toUri().toString()));
        workspaceManager.didClose(packageAFile, closeParams);

        // For workspace/build projects, documents persist even after closing since the project remains loaded
        Assert.assertTrue(workspaceManager.document(packageAFile).isPresent(),
                "Package A document should still be in the project");
        Assert.assertTrue(workspaceManager.document(packageBFile).isPresent(),
                "Package B document should remain in the project");

        // But the projects should remain independent
        Assert.assertTrue(workspaceManager.project(packageAFile).isPresent(),
                "Package A project should still exist");
        Assert.assertTrue(workspaceManager.project(packageBFile).isPresent(),
                "Package B project should still exist");
    }

    @Test(description = "Test last-close eviction removes only the matching workspace package")
    public void testDocumentLifecycleWithLastCloseEviction() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("main.bal").toAbsolutePath();
        Path packageAUtilsFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("modules").resolve("utils").resolve("utils.bal").toAbsolutePath();
        Path packageBFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-b").resolve("main.bal").toAbsolutePath();
        workspaceManager.setEvictProjectOnLastClose(true);

        openFile(packageAFile);
        openFile(packageAUtilsFile);
        openFile(packageBFile);

        DidCloseTextDocumentParams closePackageAMainParams = new DidCloseTextDocumentParams();
        closePackageAMainParams.setTextDocument(new TextDocumentIdentifier(packageAFile.toUri().toString()));
        workspaceManager.didClose(packageAFile, closePackageAMainParams);

        Assert.assertTrue(workspaceManager.project(packageAFile).isPresent(),
                "Package A project should remain while another package A document is open");

        DidCloseTextDocumentParams closePackageAUtilsParams = new DidCloseTextDocumentParams();
        closePackageAUtilsParams.setTextDocument(new TextDocumentIdentifier(packageAUtilsFile.toUri().toString()));
        workspaceManager.didClose(packageAUtilsFile, closePackageAUtilsParams);

        Assert.assertTrue(workspaceManager.project(packageAFile).isEmpty(),
                "Package A project should be evicted after its last open document closes");
        Assert.assertTrue(workspaceManager.project(packageBFile).isPresent(),
                "Package B project should remain loaded after evicting package A");
    }

    /**
     * Test module access within workspace project.
     */
    @Test(description = "Test module access within workspace project")
    public void testWorkspaceModuleAccess() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("main.bal").toAbsolutePath();
        Path moduleUtilsFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("modules").resolve("utils")
                .resolve("utils.bal").toAbsolutePath();

        // Open files from package and its module
        openFile(packageAFile);
        openFile(moduleUtilsFile);

        // Verify both are loaded
        Assert.assertTrue(workspaceManager.document(packageAFile).isPresent(),
                "Main file should be loaded");
        Assert.assertTrue(workspaceManager.document(moduleUtilsFile).isPresent(),
                "Module file should be loaded");

        // Verify they belong to the same module hierarchy
        Optional<Module> mainModule = workspaceManager.module(packageAFile);
        Assert.assertTrue(mainModule.isPresent(), "Main module should be present");
    }

    /**
     * Test file system change events in workspace projects.
     */
    @Test(description = "Test file system events in workspace project")
    public void testWorkspaceFileSystemEvents() throws WorkspaceDocumentException, IOException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("main.bal").toAbsolutePath();

        // Open the workspace
        openFile(packageAFile);

        Module oldModule = workspaceManager.module(packageAFile).orElseThrow();

        // Create a new file in the same package
        Path newFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-a").resolve("new-file.bal").toAbsolutePath();

        try {
            Files.write(newFile, "function newFunc() {}".getBytes());
            FileEvent fileEvent = new FileEvent(newFile.toUri().toString(), FileChangeType.Created);

            // Notify workspace manager
            workspaceManager.didChangeWatched(newFile, fileEvent);

            // Creating new document should change the Module
            Assert.assertNotSame(oldModule, workspaceManager.module(packageAFile).orElseThrow(),
                    "Module should be updated after file creation");
        } finally {
            Files.deleteIfExists(newFile);
        }
    }

    /**
     * Test single package workspace.
     */
    @Test(description = "Test single package workspace project")
    public void testSinglePackageWorkspace() throws WorkspaceDocumentException {
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path filePath = workspaceProjectsPath.resolve("single-package-workspace")
                .resolve("my-package").resolve("main.bal").toAbsolutePath();

        // Open file from single package workspace
        openFile(filePath);

        // Verify document and project are loaded
        Assert.assertTrue(workspaceManager.document(filePath).isPresent(),
                "Document should be present");
        Assert.assertTrue(workspaceManager.project(filePath).isPresent(),
                "Project should be present");

        // Verify package root is correctly identified
        Path packageRoot = workspaceManager.projectRoot(filePath);
        Assert.assertEquals(packageRoot.getFileName().toString(), "my-package",
                "Package root should be identified correctly");

        // Verify it's part of a workspace
        Assert.assertEquals(packageRoot.getParent().getFileName().toString(), "single-package-workspace",
                "Parent should be the workspace directory");
    }

    /**
     * Test opening a workspace project with expr:// scheme and verify diagnostics.
     */
    @Test(description = "Test expr scheme with workspace project and diagnostics")
    public void testExprSchemeWorkspaceWithDiagnostics()
            throws WorkspaceDocumentException, IOException, EventSyncException {
        // 1. Read file content
        Path workspaceProjectsPath = RESOURCE_DIRECTORY.resolve("workspace-projects");
        Path packageAFile = workspaceProjectsPath.resolve("simple-workspace")
                .resolve("package-b").resolve("main.bal").toAbsolutePath();
        BallerinaWorkspaceManagerProxy workspaceManagerProxy =
                new BallerinaWorkspaceManagerProxyImpl(new LanguageServerContextImpl());
        workspaceManagerProxy.get().loadProject(packageAFile);
        byte[] encodedContent = Files.readAllBytes(packageAFile);

        // 2. Open same file with expr:// scheme
        String exprUri = packageAFile.toUri().toString().replace("file:///", "expr:///");
        DidOpenTextDocumentParams exprParams = new DidOpenTextDocumentParams();
        TextDocumentItem exprDocumentItem = new TextDocumentItem();
        exprDocumentItem.setUri(exprUri);
        exprDocumentItem.setText(new String(encodedContent));
        exprParams.setTextDocument(exprDocumentItem);
        workspaceManagerProxy.didOpen(exprParams);

        // 3. Get diagnostics and verify no errors
        Project project = workspaceManagerProxy.get(exprUri).loadProject(packageAFile);
        PackageCompilation compilation = project.currentPackage().getCompilation();
        Collection<Diagnostic> diagnostics = compilation.diagnosticResult().diagnostics();
        Assert.assertTrue(diagnostics.isEmpty(),
                "Project should not have any compilation errors. Found: " + diagnostics.size());
    }

    private List<WorkspaceFolder> mockWorkspaceFolders() {
        List<WorkspaceFolder> workspaceFolders = new ArrayList<>();
        Path workspaceRoot = RESOURCE_DIRECTORY.resolve("workspace");
        workspaceFolders.add(new WorkspaceFolder(workspaceRoot.resolve("workspace1").toUri().toString(), "workspace1"));
        workspaceFolders.add(new WorkspaceFolder(workspaceRoot.resolve("workspace2").toUri().toString(), "workspace2"));
        workspaceFolders.add(new WorkspaceFolder(workspaceRoot.resolve("workspace3").toUri().toString(), "workspace3"));
        return workspaceFolders;
    }

    private static String guessJavaPath() {
        boolean isWindows = System.getProperty("os.name").toLowerCase(Locale.ENGLISH).contains("win");
        String exe = isWindows ? "java.exe" : "java";
        return System.getProperty("java.home") + File.separator + "bin" + File.separator + exe;
    }

    private void openFile(Path singleFile) throws WorkspaceDocumentException {
        DidOpenTextDocumentParams params = new DidOpenTextDocumentParams();
        TextDocumentItem textDocumentItem = new TextDocumentItem();
        textDocumentItem.setUri(singleFile.toUri().toString());
        textDocumentItem.setText(dummyContent);
        params.setTextDocument(textDocumentItem);
        workspaceManager.didOpen(singleFile, params);
    }

    @DataProvider
    public Object[] fileOpenUpdateTestDataProvider() {
        return new Path[]{
                RESOURCE_DIRECTORY.resolve("single-file").resolve("main.bal").toAbsolutePath(),
                RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath()
        };
    }

    @DataProvider
    public Object[] fileOpenWithDuplicateFilesDataProvider() {
        return new Path[]{
                RESOURCE_DIRECTORY.resolve("pkg_with_duplicate_files1").resolve("main.bal").toAbsolutePath(),
                RESOURCE_DIRECTORY.resolve("pkg_with_duplicate_files2").resolve("main.bal").toAbsolutePath()
        };
    }

    @DataProvider
    public Object[] workspaceEventsTestDataProvider() {
        return new Path[]{
                RESOURCE_DIRECTORY.resolve("single-file").resolve("main.bal").toAbsolutePath(),
                RESOURCE_DIRECTORY.resolve("myproject").resolve("main.bal").toAbsolutePath()
        };
    }

    private record RunResult(boolean success, String[] programOutput, String[] errorOutput) {

    }
}
