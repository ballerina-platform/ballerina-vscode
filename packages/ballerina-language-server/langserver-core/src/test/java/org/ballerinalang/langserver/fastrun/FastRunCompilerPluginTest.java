/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
package org.ballerinalang.langserver.fastrun;

import com.google.gson.JsonPrimitive;
import org.apache.commons.io.FileUtils;
import org.ballerinalang.langserver.command.executors.RunExecutor;
import org.ballerinalang.langserver.command.executors.StopExecutor;
import org.ballerinalang.langserver.commons.ExecuteCommandContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.command.CommandArgument;
import org.ballerinalang.langserver.commons.command.LSCommandExecutorException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.contexts.LanguageServerContextImpl;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManager;
import org.eclipse.lsp4j.LogTraceParams;
import org.mockito.ArgumentCaptor;
import org.mockito.MockSettings;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import static org.awaitility.Awaitility.await;

/**
 * Fast-run tests against a compiler plugin's code modifier. The fixtures import lstest/fastrun_marker, which the
 * fastRunPluginTest task installs into a Ballerina home of its own, so no other suite can see the package.
 *
 * @since 1.10.0
 */
public class FastRunCompilerPluginTest {

    private static final Path RESOURCE_DIRECTORY = Path.of("src/test/resources/fastrun");
    private static final String OUT_CHANNEL = "out";
    private static final String ERR_CHANNEL = "err";
    private BallerinaWorkspaceManager workspaceManager;

    @BeforeMethod
    void initWorkspaceManager() {
        workspaceManager = new BallerinaWorkspaceManager(new LanguageServerContextImpl());
    }

    @Test
    public void testRunAppliesCodeModifiers()
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("compiler_plugin_run");
        Path filePath = projectPath.resolve("main.bal");
        try {
            PluginRun run = executeRun(filePath);
            Assert.assertTrue(run.started(), String.join("", run.logs(ERR_CHANNEL)));
            String[] output = run.awaitLogs(OUT_CHANNEL, 1);
            Assert.assertEquals(output[0].trim(), "Hello from the code modifier!",
                    "Fast-run must run the program the compiler plugin's code modifier produced");
            Assert.assertTrue(workspaceManager.document(filePath).orElseThrow().textDocument().toString()
                            .contains("__FAST_RUN_MARKER__"),
                    "The code modifier must not change the document the editor holds");
        } finally {
            executeStop(projectPath);
        }
    }

    @Test
    public void testRunReportsCompilerPluginFailure()
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        Path projectPath = RESOURCE_DIRECTORY.resolve("compiler_plugin_failure");
        Path filePath = projectPath.resolve("main.bal");
        try {
            PluginRun run = executeRun(filePath);
            Assert.assertFalse(run.started());
            String[] errors = run.logs(ERR_CHANNEL);
            Assert.assertEquals(errors.length, 1, String.join("", errors));
            // The middle of the message is ballerina-lang's own wording, so only the parts this code adds are
            // asserted.
            Assert.assertTrue(errors[0].startsWith("error: A compiler plugin failed while preparing the fast run: "),
                    errors[0]);
            Assert.assertTrue(errors[0].contains("lstest:fastrun_marker"), errors[0]);
            Assert.assertTrue(errors[0].endsWith("(caused by java.lang.IllegalStateException)"), errors[0]);
        } finally {
            executeStop(projectPath);
        }
    }

    @Test
    public void testRunReportsAnalyzerFailureOnModifiedSource()
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        // The analyzer fails only on the modified source, so it fails in the compile that follows the modifiers.
        Path projectPath = RESOURCE_DIRECTORY.resolve("compiler_plugin_analyzer_failure");
        Path filePath = projectPath.resolve("main.bal");
        try {
            PluginRun run = executeRun(filePath);
            Assert.assertFalse(run.started());
            String[] errors = run.logs(ERR_CHANNEL);
            Assert.assertEquals(errors.length, 1, String.join("", errors));
            Assert.assertTrue(errors[0].startsWith("error: A compiler plugin failed while preparing the fast run: "),
                    errors[0]);
            Assert.assertTrue(errors[0].endsWith("(caused by java.lang.IllegalStateException)"), errors[0]);
        } finally {
            executeStop(projectPath);
        }
    }

    // A run that did not start has already logged its diagnostics, so only a started run is waited on.
    private PluginRun executeRun(Path filePath)
            throws WorkspaceDocumentException, EventSyncException, LSCommandExecutorException {
        workspaceManager.loadProject(filePath);
        MockSettings mockSettings = Mockito.withSettings().stubOnly();
        ExecuteCommandContext execContext = executionContext(filePath);
        ExtendedLanguageClient languageClient = Mockito.mock(ExtendedLanguageClient.class, mockSettings);
        ArgumentCaptor<LogTraceParams> logCaptor = ArgumentCaptor.forClass(LogTraceParams.class);
        Mockito.doNothing().when(languageClient).logTrace(logCaptor.capture());
        Mockito.when(execContext.getLanguageClient()).thenReturn(languageClient);
        return new PluginRun(new RunExecutor().execute(execContext), logCaptor);
    }

    private void executeStop(Path projectPath) {
        Assert.assertTrue(new StopExecutor().execute(executionContext(projectPath)));
        FileUtils.deleteQuietly(projectPath.resolve("target").toFile());
    }

    private ExecuteCommandContext executionContext(Path filePath) {
        ExecuteCommandContext execContext =
                Mockito.mock(ExecuteCommandContext.class, Mockito.withSettings().stubOnly());
        boolean isWindows = System.getProperty("os.name").toLowerCase(Locale.ENGLISH).contains("win");
        String java = System.getProperty("java.home") + File.separator + "bin" + File.separator
                + (isWindows ? "java.exe" : "java");
        Mockito.when(execContext.getArguments()).thenReturn(List.of(
                CommandArgument.from("command", new JsonPrimitive(java)),
                CommandArgument.from("path", new JsonPrimitive(filePath.toString()))));
        Mockito.when(execContext.workspace()).thenReturn(workspaceManager);
        return execContext;
    }

    private record PluginRun(boolean started, ArgumentCaptor<LogTraceParams> logCaptor) {

        String[] logs(String channel) {
            return List.copyOf(logCaptor.getAllValues()).stream()
                    .filter(param -> param.getVerbose().equals(channel))
                    .map(LogTraceParams::getMessage)
                    .toArray(String[]::new);
        }

        String[] awaitLogs(String channel, int minLines) {
            await().atMost(5, TimeUnit.SECONDS).until(() -> logs(channel).length >= minLines);
            return logs(channel);
        }
    }
}
