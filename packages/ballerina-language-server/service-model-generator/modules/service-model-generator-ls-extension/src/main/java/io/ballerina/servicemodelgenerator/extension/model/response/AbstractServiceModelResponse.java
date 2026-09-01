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

package io.ballerina.servicemodelgenerator.extension.model.response;

import java.util.Arrays;

/**
 * Represents the generic response generated from the service model generator LS extension.
 *
 * @since 1.3.0
 */
public abstract class AbstractServiceModelResponse {

    private String errorMsg;
    private String stacktrace;
    private ModelResolutionIssue issue;

    public void setError(Throwable e) {
        this.errorMsg = e.getLocalizedMessage();
        this.stacktrace = Arrays.toString(e.getStackTrace());
    }

    public void setIssue(ModelResolutionIssue issue) {
        this.issue = issue;
    }

    public String errorMsg() {
        return errorMsg;
    }

    public String getStackTrace() {
        return stacktrace;
    }

    public ModelResolutionIssue issue() {
        return issue;
    }
}
