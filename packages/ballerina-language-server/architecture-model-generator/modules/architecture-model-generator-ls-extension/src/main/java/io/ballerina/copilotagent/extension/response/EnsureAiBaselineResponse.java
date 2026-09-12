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

package io.ballerina.copilotagent.extension.response;

import io.ballerina.designmodelgenerator.extension.response.AbstractResponse;

import java.util.List;

/**
 * Response for the ensureAiBaseline request.
 *
 * @since 1.5.0
 */
public class EnsureAiBaselineResponse extends AbstractResponse {
    private int seededFileCount;
    // Files whose baseline content could not be applied (e.g. not part of the package).
    // The rest of the baseline is still in place.
    private List<String> failedFiles;

    public int getSeededFileCount() {
        return seededFileCount;
    }

    public void setSeededFileCount(int seededFileCount) {
        this.seededFileCount = seededFileCount;
    }

    public List<String> getFailedFiles() {
        return failedFiles;
    }

    public void setFailedFiles(List<String> failedFiles) {
        this.failedFiles = failedFiles;
    }
}
