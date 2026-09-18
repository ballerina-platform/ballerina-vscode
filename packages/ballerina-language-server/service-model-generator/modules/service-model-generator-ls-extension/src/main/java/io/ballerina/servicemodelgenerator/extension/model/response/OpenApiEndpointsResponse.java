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
 *  KIND, either express or implied. See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.servicemodelgenerator.extension.model.response;

import io.ballerina.servicemodelgenerator.extension.model.McpServiceDefaults;
import io.ballerina.servicemodelgenerator.extension.model.McpToolEndpoint;

import java.util.Arrays;
import java.util.List;

/**
 * Response carrying candidate MCP tools and the generated-service defaults.
 *
 * @param endpoints the selectable operations
 * @param defaults the generated service defaults
 * @param errorMsg the failure message, if parsing failed
 * @param stacktrace the failure stack trace, if available
 */
public record OpenApiEndpointsResponse(List<McpToolEndpoint> endpoints, McpServiceDefaults defaults,
                                       String errorMsg, String stacktrace) {
    public OpenApiEndpointsResponse(List<McpToolEndpoint> endpoints, McpServiceDefaults defaults) {
        this(endpoints, defaults, null, null);
    }

    public OpenApiEndpointsResponse(Throwable error) {
        this(List.of(), null, error.toString(), Arrays.toString(error.getStackTrace()));
    }
}
