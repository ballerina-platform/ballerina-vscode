/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.extension.request;

import com.google.gson.JsonElement;

import java.util.List;

/**
 * Represents a request to the flow model getSourceCode API.
 *
 * @param filePath file path of the source file
 * @param flowNode diagram node
 * @param formatted whether to return the source as one formatted edit per document
 * @param nodes     nodes to convert together with their own files, always formatted, instead of {@code flowNode}
 * @since 1.0.0
 */
public record FlowModelSourceGeneratorRequest(String filePath, JsonElement flowNode, boolean formatted,
                                              List<FlowModelSourceGeneratorRequest> nodes) {

    public FlowModelSourceGeneratorRequest(String filePath, JsonElement flowNode) {
        this(filePath, flowNode, false, null);
    }

}
