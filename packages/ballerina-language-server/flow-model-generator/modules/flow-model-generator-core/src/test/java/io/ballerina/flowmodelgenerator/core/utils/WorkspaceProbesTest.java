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

package io.ballerina.flowmodelgenerator.core.utils;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Probes that edit a document for a moment take turns: none finds another's edit in the document, and the document
 * ends as it began, however their threads interleave. A connection form's whole-node diagnostics (which declare the
 * connection's name in a candidate statement) and the expression editor's checks run on threads of their own; one
 * finding the other's candidate reported the connection's own name as taken, and one restoring the other's edit left
 * it in the document.
 *
 * @since 1.9.0
 */
public class WorkspaceProbesTest {

    private static final String DOCUMENT = "final kafka:Consumer kafkaConsumer = check new (servers);";
    private static final String CANDIDATE = "\nfinal mongodb:Client mongodbClient = check new ({});";

    /** A probe as the requests run one: capture the document, edit it, read it back, restore what was captured. */
    private static String probe(AtomicReference<String> document, String edit, long holdMillis) throws Exception {
        return WorkspaceProbes.exclusively(() -> {
            String captured = document.get();
            document.set(captured + edit);
            try {
                Thread.sleep(holdMillis);
                return document.get();
            } finally {
                document.set(captured);
            }
        });
    }

    @Test
    public void aProbeNeverSeesAnothersEdit() throws Exception {
        AtomicReference<String> document = new AtomicReference<>(DOCUMENT);
        CountDownLatch edited = new CountDownLatch(1);
        ExecutorService diagnostics = Executors.newSingleThreadExecutor();
        try {
            Future<?> candidate = diagnostics.submit(() -> WorkspaceProbes.exclusively(() -> {
                String captured = document.get();
                document.set(captured + CANDIDATE);
                edited.countDown();
                Thread.sleep(200);
                document.set(captured);
                return null;
            }));
            Assert.assertTrue(edited.await(5, TimeUnit.SECONDS));
            // The name check runs while the candidate is written: it must find the document without it.
            String seen = WorkspaceProbes.exclusively(document::get);
            Assert.assertEquals(seen, DOCUMENT);
            candidate.get(5, TimeUnit.SECONDS);
        } finally {
            diagnostics.shutdownNow();
        }
    }

    @Test
    public void theDocumentEndsAsItBeganHoweverProbesInterleave() throws Exception {
        AtomicReference<String> document = new AtomicReference<>(DOCUMENT);
        ExecutorService threads = Executors.newFixedThreadPool(2);
        try {
            List<Future<String>> answers = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                String edit = i % 2 == 0 ? CANDIDATE : "\nint __reserved__ = " + i + ";";
                answers.add(threads.submit(() -> probe(document, edit, 2)));
            }
            for (int i = 0; i < answers.size(); i++) {
                String edit = i % 2 == 0 ? CANDIDATE : "\nint __reserved__ = " + i + ";";
                // Each probe read back exactly its own edit on the document.
                Assert.assertEquals(answers.get(i).get(10, TimeUnit.SECONDS), DOCUMENT + edit);
            }
        } finally {
            threads.shutdownNow();
        }
        Assert.assertEquals(document.get(), DOCUMENT);
    }
}
