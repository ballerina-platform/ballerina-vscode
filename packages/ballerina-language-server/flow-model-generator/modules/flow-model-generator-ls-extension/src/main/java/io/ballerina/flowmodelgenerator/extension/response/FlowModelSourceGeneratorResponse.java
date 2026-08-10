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

package io.ballerina.flowmodelgenerator.extension.response;

import com.google.gson.JsonElement;
import io.ballerina.flowmodelgenerator.core.UserFacingException;

/**
 * Represents the response for the flow model getFlowDesignModel API.
 *
 * @since 1.0.0
 */
public class FlowModelSourceGeneratorResponse extends AbstractFlowModelResponse {

    // Phrased to read after the caller's own prefix (for example, "Failed to save changes: ").
    private static final String GENERIC_ERROR_MSG = "the operation could not be applied. Please try again.";

    private JsonElement textEdits;

    @Override
    public void setError(Throwable e) {
        // Only a message written for the user (a missing form field, an unsupported construct) is
        // reported as is. An internal failure is reported as one generic sentence, so the front end
        // can show whatever reaches it without having to judge the message.
        if (e instanceof UserFacingException) {
            super.setError(e);
            return;
        }
        setError(GENERIC_ERROR_MSG, e);
    }

    public void setTextEdits(JsonElement textEdits) {
        this.textEdits = textEdits;
    }

    public JsonElement textEdits() {
        return textEdits;
    }
}
