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
package org.ballerinalang.langserver.workspace.test.acceptance;

import org.ballerinalang.langserver.workspace.workspacemanager.change.BufferedChange;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeLayer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.ResolvedEntry;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.mockito.Mockito.mock;

/**
 * Acceptance tests for the concurrency-sensitive workspace structures.
 *
 * @since 1.7.0
 */
public class ThreadSafetyTest {

    @Test
    public void testUriResolverLockFreeReads() throws Exception {
        UriResolver resolver = new UriResolver();
        DocumentUri uri = new DocumentUri.FileUri(URI.create("file:///tmp/proj/main.bal"));
        ResolvedEntry entry = new ResolvedEntry.DocumentEntry(mock(io.ballerina.projects.Document.class));
        resolver.register(uri, entry);

        int readerCount = 100;
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(readerCount);
        AtomicInteger successCount = new AtomicInteger();

        ExecutorService readers = Executors.newFixedThreadPool(readerCount);
        for (int i = 0; i < readerCount; i++) {
            readers.submit(() -> {
                try {
                    startGate.await();
                    Optional<ResolvedEntry> result = resolver.resolve(uri);
                    if (result.isPresent()) {
                        successCount.incrementAndGet();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }

        startGate.countDown();
        resolver.register(new DocumentUri.FileUri(URI.create("file:///tmp/proj/util.bal")),
                new ResolvedEntry.DocumentEntry(mock(io.ballerina.projects.Document.class)));
        done.await();
        readers.shutdown();

        Assert.assertEquals(successCount.get(), readerCount);
    }

    @Test
    public void testNoRawCollectionsInMultiThreadedFields() throws Exception {
        String[] classesToCheck = {
                "org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl",
                "org.ballerinalang.langserver.workspace.execution.ProcessRegistry"
        };

        for (String className : classesToCheck) {
            Class<?> clazz = Class.forName(className);
            for (Field field : clazz.getDeclaredFields()) {
                if (!Modifier.isStatic(field.getModifiers())) {
                    String typeName = field.getType().getName();
                    Assert.assertFalse(typeName.equals("java.util.HashMap")
                                    || typeName.equals("java.util.HashSet")
                                    || typeName.equals("java.util.LinkedHashMap"),
                            "Field " + field.getName() + " in " + className
                                    + " uses non-thread-safe collection: " + typeName);
                }
            }
        }
    }

    @Test
    public void testChangeBufferConcurrentAppend() throws Exception {
        ChangeBuffer buffer = new ChangeBuffer();
        DocumentUri uri = new DocumentUri.FileUri(URI.create("file:///tmp/proj/main.bal"));
        ContentVersion version = new ContentVersion(1);

        int threadCount = 10;
        int changesPerThread = 100;
        CyclicBarrier startBarrier = new CyclicBarrier(threadCount);
        CountDownLatch done = new CountDownLatch(threadCount);

        ExecutorService writers = Executors.newFixedThreadPool(threadCount);
        for (int t = 0; t < threadCount; t++) {
            writers.submit(() -> {
                try {
                    startBarrier.await();
                    for (int i = 0; i < changesPerThread; i++) {
                        TextDocumentContentChangeEvent event = new TextDocumentContentChangeEvent();
                        event.setText("change-" + i);
                        buffer.append(uri, new BufferedChange(event, ChangeLayer.EDITOR, version));
                    }
                } catch (Exception e) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            });
        }

        done.await();
        writers.shutdown();

        List<BufferedChange> drained = buffer.drain(uri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), threadCount * changesPerThread);
    }
}
