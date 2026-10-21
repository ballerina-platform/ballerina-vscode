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

package org.ballerinalang.langserver.launchers.stdio;

import java.io.IOException;
import java.io.OutputStream;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;

/**
 * A stand-in for the language server process, run as a subprocess by {@link MainTest}: a non-daemon thread
 * that never ends, the way the core's workers keep the JVM alive, and a server run that serves until stdin
 * closes, or fails with an {@link Error} when asked to. Both follow {@link Main#run} with short durations.
 *
 * @since 1.7.3
 */
public final class LingeringServerMain {

    /** Argument that makes the server run fail with an {@link Error} instead of serving. */
    static final String FAIL_WITH_ERROR = "error";

    private LingeringServerMain() {
    }

    public static void main(String[] args) {
        Thread lingering = new Thread(() -> {
            try {
                new CountDownLatch(1).await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }, "lingering-worker");
        lingering.setDaemon(false);
        lingering.start();

        boolean fail = args.length > 0 && FAIL_WITH_ERROR.equals(args[0]);
        Main.run(() -> {
            if (fail) {
                throw new OutOfMemoryError("simulated");
            }
            try {
                System.in.transferTo(OutputStream.nullOutputStream());
            } catch (IOException e) {
                throw new ExecutionException(e);
            }
        }, Duration.ofMillis(200), Duration.ofSeconds(5));
    }
}
