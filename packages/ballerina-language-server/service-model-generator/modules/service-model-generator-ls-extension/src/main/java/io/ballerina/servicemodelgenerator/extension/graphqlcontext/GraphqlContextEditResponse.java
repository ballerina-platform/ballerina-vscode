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

import org.eclipse.lsp4j.TextEdit;

import java.util.List;
import java.util.Map;

/**
 * The edits of a request context change.
 *
 * @param textEdits the edits, keyed by file path
 * @param note      something the change did differently from what was asked, to tell the user, such as a function
 *                  kept because it is still used; null when it did exactly what was asked
 * @param errorMsg  why the change was refused; null when it was not
 */
public record GraphqlContextEditResponse(Map<String, List<TextEdit>> textEdits, String note, String errorMsg) {

    public GraphqlContextEditResponse(Map<String, List<TextEdit>> textEdits) {
        this(textEdits, null, null);
    }

    public static GraphqlContextEditResponse error(Throwable e) {
        return new GraphqlContextEditResponse(Map.of(), null, e.getMessage() != null ? e.getMessage() : e.toString());
    }
}
