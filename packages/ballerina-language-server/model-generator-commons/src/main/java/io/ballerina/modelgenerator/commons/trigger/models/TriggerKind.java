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

package io.ballerina.modelgenerator.commons.trigger.models;

import java.util.Arrays;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The canonical set of integration kinds a trigger's wire {@code triggerKind}/legacy {@code kind}
 * field may name. The single source of truth for the allow-list every {@code effectiveTriggerKind}
 * variant across the LS extensions and {@code model-generator-commons} used to duplicate inline.
 *
 * @since 1.10.0
 */
public enum TriggerKind {

    EVENT("event"),
    MCP("mcp"),
    GRAPHQL("graphql"),
    HTTP("http"),
    FILE("file"),
    AI("ai");

    private final String value;

    TriggerKind(String value) {
        this.value = value;
    }

    /** The wire value this kind is serialized as, e.g. {@code "event"}. */
    public String value() {
        return value;
    }

    private static final Map<String, TriggerKind> BY_VALUE = Arrays.stream(values())
            .collect(Collectors.toMap(TriggerKind::value, Function.identity()));

    /** Whether {@code value} names one of the recognized kinds. */
    public static boolean isValid(String value) {
        return value != null && BY_VALUE.containsKey(value);
    }

    /** The canonical field over the legacy one; neither is validated against the allow-list. */
    public static String coalesce(String triggerKind, String kind) {
        return triggerKind == null ? kind : triggerKind;
    }

    /**
     * {@link #coalesce}, kept only when it names a {@linkplain #isValid recognized} kind; {@code null}
     * otherwise (both scalars absent, or naming something outside the allow-list).
     */
    public static String effectiveOrNull(String triggerKind, String kind) {
        String value = coalesce(triggerKind, kind);
        return isValid(value) ? value : null;
    }
}
