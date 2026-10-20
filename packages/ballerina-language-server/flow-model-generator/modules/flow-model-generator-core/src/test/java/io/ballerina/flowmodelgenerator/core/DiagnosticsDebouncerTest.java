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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonPrimitive;
import io.ballerina.flowmodelgenerator.core.diagnostics.DiagnosticRequest;
import io.ballerina.flowmodelgenerator.core.diagnostics.DiagnosticsDebouncer;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.lang.reflect.Field;
import java.util.Map;

/**
 * Tests that {@link DiagnosticsDebouncer} releases the key of every finished request.
 *
 * @since 1.8.0
 */
public class DiagnosticsDebouncerTest {

    @Test
    public void testImmediateRequestReleasesItsKey() throws Exception {
        DiagnosticsDebouncer debouncer = DiagnosticsDebouncer.getInstance();
        // Each form edit has its own key, so a finished request left behind is never replaced.
        for (int i = 0; i < 2000; i++) {
            debouncer.debounce(new ImmediateRequest(i)).join();
        }
        Field field = DiagnosticsDebouncer.class.getDeclaredField("delayedMap");
        field.setAccessible(true);
        Map<?, ?> delayedMap = (Map<?, ?>) field.get(debouncer);
        long deadline = System.currentTimeMillis() + 5000;
        while (!delayedMap.isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        Assert.assertTrue(delayedMap.isEmpty(), delayedMap.size() + " finished requests were left registered");
    }

    private static class ImmediateRequest extends DiagnosticRequest {

        ImmediateRequest(int id) {
            super("immediate.bal", new JsonPrimitive(id), null);
        }

        @Override
        public JsonElement call() {
            return JsonNull.INSTANCE;
        }

        @Override
        public void revertDocument() {
        }
    }
}
