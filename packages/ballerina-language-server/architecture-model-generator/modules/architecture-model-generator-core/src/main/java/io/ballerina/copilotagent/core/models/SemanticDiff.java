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

package io.ballerina.copilotagent.core.models;

import io.ballerina.tools.text.LineRange;

import java.util.Map;

/**
 * Record to represent a semantic difference in the code.
 *
 * @param changeType change type
 * @param nodeKind node kind
 * @param uri file URI
 * @param lineRange line range of the change
 * @param previousLineRange corresponding line range in the original source for modifications
 * @param metadata additional metadata about the changed node
 *
 * @since 1.5.0
 */
public record SemanticDiff(ChangeType changeType, NodeKind nodeKind, String uri, LineRange lineRange,
                           LineRange previousLineRange, Map<String, String> metadata) {

    public SemanticDiff(ChangeType changeType, NodeKind nodeKind, String uri, LineRange lineRange,
                        Map<String, String> metadata) {
        this(changeType, nodeKind, uri, lineRange, null, metadata);
    }
}
