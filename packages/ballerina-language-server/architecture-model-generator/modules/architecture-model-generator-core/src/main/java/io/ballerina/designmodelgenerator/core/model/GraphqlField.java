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

package io.ballerina.designmodelgenerator.core.model;

import java.util.List;

/**
 * The GraphQL schema view of a service function: the field it exposes on the Query, Mutation or Subscription type.
 * Types are rendered in GraphQL SDL notation (e.g. {@code ID!}, {@code [Book!]}) by
 * {@link io.ballerina.modelgenerator.commons.GraphqlTypeMapper}, which follows the GraphQL compiler plugin's schema
 * generation, so they reflect what clients see rather than the Ballerina signature.
 *
 * @param name        the field name as clients see it (Ballerina identifier escapes removed)
 * @param args        the field arguments, in declaration order
 * @param type        the field's output type
 * @param description the field description, if documented
 * @param deprecated  whether the field is marked deprecated
 * @since 1.7.0
 */
public record GraphqlField(String name, List<Argument> args, String type, String description, boolean deprecated) {

    /**
     * A GraphQL field argument.
     *
     * @param name         the argument name
     * @param type         the argument input type
     * @param defaultValue the default value literal, if any
     * @param description  the argument description, if documented
     */
    public record Argument(String name, String type, String defaultValue, String description) {
    }
}
