/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.modelgenerator.commons.CommonUtils;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * Utility class for flow node and properties related operations.
 *
 * @since 1.0.0
 */
public class FlowNodeUtil {

    private static final Pattern ERROR_MEMBER_PATTERN = Pattern.compile("error(\\s*<.*>)?");

    /**
     * Check whether the given flow node has the check key flag set.
     *
     * @param flowNode flow node to check
     * @return true if the check key flag is set, false otherwise
     */
    public static boolean hasCheckKeyFlagSet(FlowNode flowNode) {
        Map<String, Property> properties = flowNode.properties();
        return properties != null &&
                properties.containsKey(Property.CHECK_ERROR_KEY) &&
                properties.get(Property.CHECK_ERROR_KEY).value().equals(true);
    }

    // Only an explicit false: a node without the flag is written with check, as its template has always been.
    public static boolean isUnchecked(FlowNode flowNode) {
        Map<String, Property> properties = flowNode.properties();
        Property checkError = properties == null ? null : properties.get(Property.CHECK_ERROR_KEY);
        return checkError != null && "false".equals(String.valueOf(checkError.value()));
    }

    // An unchecked call that can fail, which carries checkError false, keeps the error in its variable's type.
    public static String withErrorWhenUnchecked(FlowNode flowNode, String type) {
        return isUnchecked(flowNode) ? withErrorReturn(type) : type;
    }

    public static String withErrorReturn(String returnType) {
        if (returnType.isEmpty()) {
            return "error?";
        }
        return admitsError(returnType) ? returnType : returnType + "|error";
    }

    /**
     * The keyword a checked call is written with: {@code checkpanic} when the statement the node was
     * read from used it, {@code check} otherwise, so a re-saved node keeps how it handled the error.
     *
     * @param flowNode the flow node being written
     * @return the check keyword's syntax kind
     */
    public static SyntaxKind checkKeyword(FlowNode flowNode) {
        return flowNode.hasFlag(FlowNode.NODE_FLAG_CHECKPANIC) ? SyntaxKind.CHECKPANIC_KEYWORD
                : SyntaxKind.CHECK_KEYWORD;
    }

    /**
     * Check weather the given position is within a do clause.
     *
     * @param context template context
     * @return true if the context is within a do clause, false otherwise
     */
    public static boolean withinDoClause(NodeBuilder.TemplateContext context) {
        return CommonUtils.withinDoClause(context.workspaceManager(), context.filePath(),
                context.codedata().lineRange());
    }

    /**
     * Get the property key for a given key. If the key is a reserved property key, append an underscore to it.
     *
     * @param key the key to check
     * @return the property key
     */
    public static String getPropertyKey(String key) {
        if (Property.RESERVED_PROPERTY_KEYS.contains(key)) {
            return "$" + key;
        }
        return key;
    }

    // Whether the type can hold an error itself: a top-level union member is `error` (`error[]` holds only arrays).
    private static boolean admitsError(String type) {
        int depth = 0;
        int start = 0;
        for (int i = 0; i <= type.length(); i++) {
            char c = i < type.length() ? type.charAt(i) : '|';
            if (c == '(' || c == '<' || c == '[' || c == '{') {
                depth++;
            } else if (c == ')' || c == '>' || c == ']' || c == '}') {
                depth--;
            } else if (c == '|' && depth == 0) {
                String member = type.substring(start, i).trim();
                if (member.endsWith("?")) {
                    member = member.substring(0, member.length() - 1).trim();
                }
                if (member.startsWith("(") && member.endsWith(")")
                        ? admitsError(member.substring(1, member.length() - 1))
                        : ERROR_MEMBER_PATTERN.matcher(member).matches()) {
                    return true;
                }
                start = i + 1;
            }
        }
        return false;
    }
}
