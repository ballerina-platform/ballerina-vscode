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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.Locale;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_DEFAULT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.MCP;

/**
 * Fills in the display badge ({@code metadata.badge}) shown before each function name in the service
 * designer, for function kinds not already covered by a trigger-supplied badge.
 *
 * @since 1.9.0
 */
public final class FunctionBadge {

    private static final String INIT = "INIT";
    private static final String TOOL = "Tool";
    private static final String FUNC = "FUNC";
    private static final String INIT_FUNCTION_NAME = "init";

    private FunctionBadge() {
    }

    /** Stamps badges on the service's functions that don't already carry one. */
    public static void stamp(Service service) {
        if (service == null || service.getFunctions() == null) {
            return;
        }
        String module = service.getModuleName();
        boolean http = HTTP.equalsIgnoreCase(module);
        boolean mcp = MCP.equalsIgnoreCase(module);
        for (Function function : service.getFunctions()) {
            if (hasBadge(function)) {
                continue;
            }
            String badge = resolve(function, http, mcp);
            if (badge != null) {
                apply(function, badge);
            }
        }
    }

    private static String resolve(Function function, boolean http, boolean mcp) {
        if (INIT_FUNCTION_NAME.equals(valueOf(function.getName()))) {
            return INIT;
        }
        String kind = function.getKind();
        if (http && KIND_RESOURCE.equalsIgnoreCase(kind)) {
            String method = valueOf(function.getAccessor());
            return method == null || method.isBlank() ? null : method.trim().toUpperCase(Locale.US);
        }
        if (mcp && KIND_REMOTE.equalsIgnoreCase(kind)) {
            return TOOL;
        }
        if (KIND_DEFAULT.equalsIgnoreCase(kind)) {
            return FUNC;
        }
        return null;
    }

    private static boolean hasBadge(Function function) {
        MetaData metadata = function.getMetadata();
        return metadata != null && metadata.badge() != null && !metadata.badge().isBlank();
    }

    private static void apply(Function function, String badge) {
        MetaData metadata = function.getMetadata();
        if (metadata == null) {
            function.setMetadata(new MetaData(null, null, null, null, badge));
        } else {
            function.setMetadata(new MetaData(metadata.label(), metadata.description(),
                    metadata.notice(), metadata.icon(), badge));
        }
    }

    private static String valueOf(Value value) {
        return value == null ? null : value.getValue();
    }
}
