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

package org.ballerinalang.langserver.common.utils;

/**
 * Whether this language server may reach Ballerina Central, decided once for the whole server.
 * <p>
 * An offline server resolves only from the Ballerina home it was given. Test runs get one by setting
 * {@code -Dls.test.offline=true}, which is the default source of this value, so nothing has to be initialised for it to
 * be correct. {@link #setOffline(boolean)} lets an embedder override it explicitly.
 * <p>
 * Code that resolves packages should ask {@link #isOffline()} rather than reading a system property, so that adding a
 * resolution path does not mean remembering the test setup.
 *
 * @since 1.7.0
 */
public final class ResolutionMode {

    // Seeded from the system property so the value is right before anyone calls the setter. Volatile because an
    // embedder may override it after request threads have started.
    private static volatile boolean offline = Boolean.getBoolean("ls.test.offline");

    private ResolutionMode() {
    }

    /**
     * Whether package resolution must avoid Ballerina Central.
     *
     * @return {@code true} when the server resolves offline.
     */
    public static boolean isOffline() {
        return offline;
    }

    /**
     * Overrides the mode for this server. Intended for the server bootstrap and for tests that drive the server
     * directly; the system property covers the ordinary case.
     *
     * @param value {@code true} to resolve without contacting Ballerina Central.
     */
    public static void setOffline(boolean value) {
        offline = value;
    }
}
