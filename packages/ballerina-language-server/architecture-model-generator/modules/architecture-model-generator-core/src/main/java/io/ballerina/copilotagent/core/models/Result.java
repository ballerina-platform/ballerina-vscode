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

import java.util.List;

/**
 * Result record to hold the outcome of semantic diff analysis.
 *
 * @param loadDesignDiagrams indicates whether design diagrams should be loaded
 * @param semanticDiffs   list of semantic differences identified
 * @param compilationError message of a package-compilation failure hit while comparing design
 *                         models, when the syntax-level diffs themselves are still valid
 *
 * @since 1.5.0
 */
public record Result(boolean loadDesignDiagrams, List<SemanticDiff> semanticDiffs, String compilationError) {

    public Result(boolean loadDesignDiagrams, List<SemanticDiff> semanticDiffs) {
        this(loadDesignDiagrams, semanticDiffs, null);
    }
}
