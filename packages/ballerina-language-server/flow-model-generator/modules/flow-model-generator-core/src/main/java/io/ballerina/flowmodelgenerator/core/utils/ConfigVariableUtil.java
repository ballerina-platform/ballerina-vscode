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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.compiler.syntax.tree.SyntaxKind;

import java.util.Arrays;

/**
 * Utilities for configurable variables, shared by the configurable editor and the flow node diagnostics.
 *
 * @since 1.8.0
 */
public final class ConfigVariableUtil {

    private static final String LS = System.lineSeparator();
    private static final String HASH_COMMENT_PREFIX = "# ";
    private static final String REQUIRED_VALUE = "?";
    private static final String VAR = "var";

    private ConfigVariableUtil() {
    }

    /**
     * Builds the source of a configurable variable declaration, with its documentation as {@code #} comments above
     * it. An empty default value makes the configurable required ({@code ?}).
     *
     * @param type          the type of the variable; {@code var} when empty
     * @param name          the name of the variable
     * @param defaultValue  the default value, or empty when the value must come from Config.toml
     * @param documentation the documentation in Markdown, or empty
     * @return the declaration source
     */
    public static String constructConfigStatement(String type, String name, String defaultValue,
                                                  String documentation) {
        StringBuilder statement = new StringBuilder();
        // UI sends \n on every OS
        if (!documentation.isBlank()) {
            Arrays.stream(documentation.strip().split("\\R")).forEach(docLine -> statement
                    .append(docLine.isBlank() ? HASH_COMMENT_PREFIX.strip() : HASH_COMMENT_PREFIX + docLine)
                    .append(LS));
        }
        statement.append(SyntaxKind.CONFIGURABLE_KEYWORD.stringValue()).append(" ")
                .append(type.isBlank() ? VAR : type).append(" ")
                .append(name).append(" ")
                .append(SyntaxKind.EQUAL_TOKEN.stringValue()).append(" ")
                .append(defaultValue.isBlank() ? REQUIRED_VALUE : defaultValue)
                .append(SyntaxKind.SEMICOLON_TOKEN.stringValue());
        return statement.toString();
    }
}
