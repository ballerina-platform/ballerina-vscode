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

import io.ballerina.compiler.api.symbols.TypeSymbol;

import java.util.List;

/**
 * API facts {@link TriggerLibraryIntrospector} resolves from a connector's compiled semantic model.
 * Facts only — no labels, defaults, or curation; combined with a connector's
 * {@link TriggerMetadataModel} to synthesize a {@code TriggerUISchemaModel}.
 *
 * @param listeners    the connector's declared listener types
 * @param serviceTypes the connector's declared service object types
 * @param annotations  the connector's declared annotations
 * @since 1.10.0
 */
public record TriggerLibraryFacts(List<Listener> listeners, List<ServiceType> serviceTypes,
                                  List<Annotation> annotations) {

    public record Listener(String type, List<Param> initParams) {
    }

    /**
     * @param name    the parameter name
     * @param type    the rendered type signature
     * @param optional whether the parameter may be omitted
     * @param kind   {@code REQUIRED}/{@code DEFAULTABLE}/{@code INCLUDED_RECORD}/{@code REST}, or
     *              {@code RECORD_FIELD} for an expanded record field
     * @param doc    the parameter's documentation, if any
     * @param fields expanded fields when {@code type} is a record; depth-capped and recursive
     * @param typeSymbol the resolved semantic type, for widget derivation; {@code null} for a fact
     *                   built from serialized data alone (see the compatibility constructor)
     */
    public record Param(String name, String type, boolean optional, String kind, String doc, List<Param> fields,
                        TypeSymbol typeSymbol) {

        /** Compatibility constructor for tests and callers that only need serializable structural facts. */
        public Param(String name, String type, boolean optional, String kind, String doc, List<Param> fields) {
            this(name, type, optional, kind, doc, fields, null);
        }
    }

    public record Function(String name, List<String> qualifiers, String kind, String returnType,
                           boolean returnsError, String doc, List<Param> parameters) {
    }

    public record ServiceType(String name, String doc, List<Function> functions) {
    }

    public record Annotation(String name, String module, String typeConstraint, List<String> attachmentPoints,
                             String doc, List<Param> fields) {
    }
}
