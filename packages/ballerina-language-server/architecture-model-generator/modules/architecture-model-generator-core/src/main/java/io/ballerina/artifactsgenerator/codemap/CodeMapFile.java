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

package io.ballerina.artifactsgenerator.codemap;

import java.util.Collections;
import java.util.List;

/**
 * Represents a Ballerina source file with its extracted codeMap artifacts.
 *
 * @param artifacts the list of codeMap artifacts extracted from this file
 * @param markdown the markdown representation of this file's artifacts
 * @since 1.8.0
 */
public record CodeMapFile(List<CodeMapArtifact> artifacts, String markdown) {

    public CodeMapFile {
        artifacts = artifacts == null ? Collections.emptyList() : Collections.unmodifiableList(artifacts);
    }

    /**
     * Creates a CodeMapFile with artifacts only (no markdown).
     *
     * @param artifacts the list of codeMap artifacts
     */
    public CodeMapFile(List<CodeMapArtifact> artifacts) {
        this(artifacts, null);
    }
}
