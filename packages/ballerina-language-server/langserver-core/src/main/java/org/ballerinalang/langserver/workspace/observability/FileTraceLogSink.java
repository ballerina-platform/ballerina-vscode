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

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * File-backed trace log sink.
 *
 * @since 1.7.0
 */
public final class FileTraceLogSink implements TraceLogSink {
    private static final java.io.PrintStream ERROR_STREAM = System.err;
    private static final DateTimeFormatter FILE_TIMESTAMP_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");
    private final Path logFilePath;
    private final Object writeLock;
    private final AtomicBoolean errorReported;
    private final AtomicBoolean closed;
    private volatile BufferedWriter writer;

    /**
     * Creates a trace file in the JVM temporary directory.
     *
     * @throws IOException if the file cannot be created
     */
    public FileTraceLogSink() throws IOException {
        this(defaultLogFilePath());
    }

    /**
     * Creates a trace file sink targeting the given path.
     *
     * @param logFilePath file path to append trace entries to
     * @throws IOException if the writer cannot be created
     */
    public FileTraceLogSink(Path logFilePath) throws IOException {
        this.logFilePath = logFilePath;
        Path parent = logFilePath.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        this.writeLock = new Object();
        this.writer = null;
        this.errorReported = new AtomicBoolean(false);
        this.closed = new AtomicBoolean(false);
    }

    /**
     * Writes the formatted trace entry to the backing file.
     *
     * @param level log level for the entry
     * @param fields structured fields to write
     */
    @Override
    public void write(String level, Map<String, String> fields) {
        if (closed.get()) {
            return;
        }

        synchronized (writeLock) {
            if (closed.get()) {
                return;
            }
            try {
                BufferedWriter activeWriter = ensureWriter();
                activeWriter.write(WorkspaceTraceLogger.formatLogEntry(level, fields));
                activeWriter.newLine();
                activeWriter.flush();
            } catch (IOException exception) {
                reportWriteFailure(exception);
            }
        }
    }

    /**
     * Returns the active trace file path.
     *
     * @return trace file path
     */
    public Path logFilePath() {
        return logFilePath;
    }

    /**
     * Flushes and closes the underlying writer once.
     */
    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }

        synchronized (writeLock) {
            try {
                if (writer != null) {
                    writer.flush();
                    writer.close();
                }
            } catch (IOException exception) {
                reportWriteFailure(exception);
            }
        }
    }

    private BufferedWriter ensureWriter() throws IOException {
        if (writer == null) {
            writer = Files.newBufferedWriter(logFilePath, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        }
        return writer;
    }

    private static Path defaultLogFilePath() {
        String fileName = "ballerina-ls-trace-" + FILE_TIMESTAMP_FORMAT.format(LocalDateTime.now())
                + "-" + UUID.randomUUID() + ".log";
        return Path.of(System.getProperty("java.io.tmpdir")).resolve(fileName);
    }

    private void reportWriteFailure(IOException exception) {
        if (errorReported.compareAndSet(false, true)) {
            ERROR_STREAM.println("[WARN] Failed to write workspace trace log to file '" + logFilePath + "': "
                    + exception.getMessage());
        }
    }
}
