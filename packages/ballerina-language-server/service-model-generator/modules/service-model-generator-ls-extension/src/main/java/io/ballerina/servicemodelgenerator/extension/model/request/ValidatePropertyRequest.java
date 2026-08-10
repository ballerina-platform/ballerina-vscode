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

package io.ballerina.servicemodelgenerator.extension.model.request;

import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Value;

/**
 * A request to validate a single form node while the user types.
 *
 * @param filePath     the absolute path of the file being validated
 * @param propertyPath echoed back on every result so the client can route it
 * @param property     the current value of the field under validation
 * @param moduleName   the connector module, needed by the listener-compatibility rule
 * @param codedata     locates the enclosing service for service-scoped rules; may be {@code null}
 * @param version      the client's per-field revision, echoed back so stale responses can be dropped
 * @since 1.8.0
 */
public record ValidatePropertyRequest(String filePath, String propertyPath, Value property, String moduleName,
                                      Codedata codedata, int version) {
}
