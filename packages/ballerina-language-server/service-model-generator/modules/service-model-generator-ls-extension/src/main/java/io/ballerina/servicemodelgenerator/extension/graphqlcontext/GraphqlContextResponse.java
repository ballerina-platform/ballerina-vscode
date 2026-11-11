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

package io.ballerina.servicemodelgenerator.extension.graphqlcontext;

import io.ballerina.tools.text.LineRange;

import java.util.List;

/**
 * The request context of a GraphQL service.
 *
 * @param supported        whether the service is a GraphQL service
 * @param configured       whether its config sets {@code contextInit}
 * @param functionName     the function {@code contextInit} names; null when unset or set to an expression
 * @param expression       the {@code contextInit} value as written; null when unset
 * @param functionFilePath the file defining the function; null when it is not found in the module
 * @param functionRange    the function's range in that file; null when it is not found in the module
 * @param signatureValid   whether the function has the signature {@code contextInit} needs
 * @param candidates       the module functions with that signature, which can be picked instead
 * @param entries          the values the function sets on the context; empty when it is not editable
 * @param editable         whether the designer can edit the function's values; false when its body is not of the
 *                         shape the designer writes, which is then edited in the flow diagram
 * @param notEditableReason why the values cannot be edited; null when they can
 * @param valueScope       where in the function's file a value expression is in scope, for an expression editor's
 *                         completions and diagnostics; null when the values cannot be edited
 * @param errorMsg         an unexpected failure; null on success. A failed read keeps {@code supported} true, so it
 *                         is never mistaken for a service with no request context
 */
public record GraphqlContextResponse(boolean supported, boolean configured, String functionName, String expression,
                                     String functionFilePath, LineRange functionRange, boolean signatureValid,
                                     List<String> candidates, List<ContextFunctionBody.ContextEntry> entries,
                                     boolean editable, String notEditableReason, LineRange valueScope,
                                     String errorMsg) {

    public static GraphqlContextResponse unsupported() {
        return new GraphqlContextResponse(false, false, null, null, null, null, false, List.of(), List.of(), false,
                null, null, null);
    }

    public static GraphqlContextResponse notConfigured(List<String> candidates) {
        return new GraphqlContextResponse(true, false, null, null, null, null, false, candidates, List.of(), false,
                null, null, null);
    }

    public static GraphqlContextResponse error(Throwable e) {
        return new GraphqlContextResponse(true, false, null, null, null, null, false, List.of(), List.of(), false,
                null, null, e.getMessage() != null ? e.getMessage() : e.toString());
    }
}
