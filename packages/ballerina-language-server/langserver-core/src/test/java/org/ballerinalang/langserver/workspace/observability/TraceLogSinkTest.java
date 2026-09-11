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

package org.ballerinalang.langserver.workspace.observability;

import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;


/**
 * Tests for trace log sinks and sink-based trace logger dispatch.
 *
 * @since 1.7.0
 */
public class TraceLogSinkTest {

    /**
     * Verifies console trace sink preserves the expected log format.
     */
    @Test
    public void consoleTraceLogSink_write_formatsCorrectly() {
        // RED: this test should fail - ConsoleTraceLogSink formatting not yet implemented
        PrintStream originalOut = System.out;
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        System.setOut(new PrintStream(outputStream, true, StandardCharsets.UTF_8));
        try {
            ConsoleTraceLogSink sink = new ConsoleTraceLogSink();
            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("timestamp", "2026-03-20T12:34:56Z");
            fields.put("eventType", "WORKSPACE_PROJECT_REGISTERED");
            fields.put("eventId", "WM-E1");
            fields.put("sourceContext", "workspace-a");
            sink.write("INFO", fields);

            String output = outputStream.toString(StandardCharsets.UTF_8).trim();
            Assert.assertEquals(output,
                    "[INFO] 2026-03-20T12:34:56Z WORKSPACE_PROJECT_REGISTERED eventId=WM-E1 sourceContext=workspace-a");
        } finally {
            System.setOut(originalOut);
        }
    }

    /**
     * Verifies file trace sink writes formatted entries to the configured file.
     *
     * @throws IOException if temp file creation fails
     */
    @Test
    public void fileTraceLogSink_write_writesToFile() throws IOException {
        Path tempFile = Files.createTempFile("trace-log-sink-test", ".log");
        try (FileTraceLogSink sink = new FileTraceLogSink(tempFile)) {
            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("timestamp", "2026-03-20T12:34:56Z");
            fields.put("eventType", "WORKSPACE_PROJECT_UPDATED");
            fields.put("eventId", "WM-E4");
            fields.put("sourceContext", "workspace-a");
            sink.write("DEBUG", fields);
        }

        String content = Files.readString(tempFile).trim();
        Assert.assertEquals(content,
                "[DEBUG] 2026-03-20T12:34:56Z WORKSPACE_PROJECT_UPDATED eventId=WM-E4 sourceContext=workspace-a");
        Files.deleteIfExists(tempFile);
    }

    /**
     * Verifies file trace sink close can be called more than once safely.
     *
     * @throws IOException if temp file creation fails
     */
    @Test
    public void fileTraceLogSink_close_isIdempotent() throws IOException {
        Path tempFile = Files.createTempFile("trace-log-sink-test", ".log");
        FileTraceLogSink sink = new FileTraceLogSink(tempFile);

        sink.close();
        sink.close();

        Assert.assertTrue(Files.exists(tempFile));
        Files.deleteIfExists(tempFile);
    }

    /**
     * Verifies file trace sink ignores writes after closure.
     *
     * @throws IOException if temp file creation fails
     */
    @Test
    public void fileTraceLogSink_writeAfterClose_silentlyIgnored() throws IOException {
        Path tempFile = Files.createTempFile("trace-log-sink-test", ".log");
        FileTraceLogSink sink = new FileTraceLogSink(tempFile);

        sink.close();
        sink.write("INFO", Map.of(
                "timestamp", "2026-03-20T12:34:56Z",
                "eventType", "WORKSPACE_PROJECT_REGISTERED"
        ));

        Assert.assertTrue(Files.readString(tempFile).isEmpty());
        Files.deleteIfExists(tempFile);
    }

    /**
     * Verifies the default logger constructor creates a temporary trace file sink.
     *
     * @throws IOException if temporary directory inspection fails
     */
    @Test
    public void workspaceTraceLogger_defaultConstructor_createsTempTraceFile() throws IOException {
        Path tempDirectory = Path.of(System.getProperty("java.io.tmpdir"));
        Set<Path> beforeFiles = traceFilesIn(tempDirectory);

        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(eventBus);
        traceLogger.logStructured("INFO", Map.of(
                "timestamp", "2026-03-20T12:34:56Z",
                "eventType", "WORKSPACE_PROJECT_REGISTERED"
        ));

        Set<Path> afterFiles = traceFilesIn(tempDirectory);
        afterFiles.removeAll(beforeFiles);

        Assert.assertFalse(afterFiles.isEmpty(), "Default logger should create a temp trace file");

        traceLogger.close();
        eventBus.close();
        for (Path logFile : afterFiles) {
            Files.deleteIfExists(logFile);
        }
    }

    /**
     * Verifies sink-backed logger dispatches structured logs to each configured sink.
     *
     * @throws InterruptedException if event delivery is interrupted
     */
    @Test
    public void workspaceTraceLogger_sinkConstructor_dispatchesToAllSinks() throws InterruptedException {
        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        RecordingTraceLogSink firstSink = new RecordingTraceLogSink();
        RecordingTraceLogSink secondSink = new RecordingTraceLogSink();
        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(eventBus, LogLevel.INFO,
                List.of(firstSink, secondSink));

        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///workspace-a")));
        Thread.sleep(300);

        Assert.assertEquals(firstSink.entries.size(), 1);
        Assert.assertEquals(secondSink.entries.size(), 1);
        eventBus.close();
        traceLogger.close();
    }

    /**
     * Verifies logger close closes each configured sink.
     */
    @Test
    public void workspaceTraceLogger_close_closesAllSinks() {
        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        RecordingTraceLogSink firstSink = new RecordingTraceLogSink();
        RecordingTraceLogSink secondSink = new RecordingTraceLogSink();
        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(eventBus, LogLevel.INFO,
                List.of(firstSink, secondSink));

        traceLogger.close();

        Assert.assertTrue(firstSink.closed.get());
        Assert.assertTrue(secondSink.closed.get());
        eventBus.close();
    }

    /**
     * Verifies sink failures do not stop dispatch to remaining sinks.
     *
     * @throws InterruptedException if event delivery is interrupted
     */
    @Test
    public void workspaceTraceLogger_sinkException_doesNotBreakOtherSinks() throws InterruptedException {
        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        TraceLogSink failingSink = new TraceLogSink() {
            @Override
            public void write(String level, Map<String, String> fields) {
                throw new RuntimeException("expected failure");
            }

            @Override
            public void close() {
            }
        };
        RecordingTraceLogSink recordingSink = new RecordingTraceLogSink();
        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(eventBus, LogLevel.INFO,
                List.of(failingSink, recordingSink));

        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, URI.create("file:///workspace-a")));
        Thread.sleep(300);

        Assert.assertEquals(recordingSink.entries.size(), 1);
        eventBus.close();
        traceLogger.close();
    }

    private static final class RecordingTraceLogSink implements TraceLogSink {

        private final List<Map<String, String>> entries = new CopyOnWriteArrayList<>();
        private final AtomicBoolean closed = new AtomicBoolean(false);

        @Override
        public void write(String level, Map<String, String> fields) {
            entries.add(Map.copyOf(fields));
        }

        @Override
        public void close() {
            closed.set(true);
        }
    }

    private static Set<Path> traceFilesIn(Path directory) throws IOException {
        try (var stream = Files.list(directory)) {
            return stream
                    .filter(path -> path.getFileName().toString().startsWith("ballerina-ls-trace-"))
                    .filter(path -> path.getFileName().toString().endsWith(".log"))
                    .collect(Collectors.toSet());
        }
    }
}
