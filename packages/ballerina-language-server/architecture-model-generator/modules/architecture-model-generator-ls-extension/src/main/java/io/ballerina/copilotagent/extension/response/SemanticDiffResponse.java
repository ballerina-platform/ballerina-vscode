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

package io.ballerina.copilotagent.extension.response;

import io.ballerina.copilotagent.core.models.SemanticDiff;
import io.ballerina.designmodelgenerator.extension.response.AbstractResponse;

import java.util.List;

/**
 * Response for semantic diff generation.
 *
 * @since 1.5.0
 */
public class SemanticDiffResponse extends AbstractResponse {
    private boolean loadDesignDiagrams;
    private List<SemanticDiff> semanticDiffs;
    // Set when the syntax-level diffs succeeded but the package failed to compile
    // (design-model comparison). Unlike errorMsg, the diffs are still usable.
    private String compilationError;

    public String getCompilationError() {
        return compilationError;
    }

    public void setCompilationError(String compilationError) {
        this.compilationError = compilationError;
    }

    public boolean isLoadDesignDiagrams() {
        return loadDesignDiagrams;
    }

    public void setLoadDesignDiagrams(boolean loadDesignDiagrams) {
        this.loadDesignDiagrams = loadDesignDiagrams;
    }

    public List<SemanticDiff> getSemanticDiffs() {
        return semanticDiffs;
    }

    public void setSemanticDiffs(List<SemanticDiff> semanticDiffs) {
        this.semanticDiffs = semanticDiffs;
    }
}
