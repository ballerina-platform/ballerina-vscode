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

package io.ballerina.servicemodelgenerator.extension.settings;

import io.ballerina.servicemodelgenerator.extension.model.Codedata;

import java.util.List;

/**
 * Requests of the Service Settings endpoints.
 */
public final class ServiceSettingsRequests {

    private ServiceSettingsRequests() {
    }

    /**
     * Sets one field of a service's config annotation.
     *
     * @param filePath the file of the service
     * @param codedata the service's codedata, whose line range locates it
     * @param field    the field to set
     * @param value    the value as a Ballerina expression; null or blank removes the field
     */
    public record UpdateSetting(String filePath, Codedata codedata, String field, String value) {
    }

    /**
     * Changes a GraphQL service's request context.
     *
     * @param filePath       the file of the service
     * @param codedata       the service's codedata, whose line range locates it
     * @param action         {@code create}, {@code use}, {@code remove} or {@code setEntries}
     * @param functionName   for {@code use}, the function to point {@code contextInit} at
     * @param deleteFunction for {@code remove}, also delete the function when nothing else references it
     * @param entries        for {@code setEntries}, the values the context should carry
     */
    public record ApplyGraphqlContext(String filePath, Codedata codedata, String action, String functionName,
                                      Boolean deleteFunction, List<ContextFunctionBody.ContextEntry> entries) {
    }
}
