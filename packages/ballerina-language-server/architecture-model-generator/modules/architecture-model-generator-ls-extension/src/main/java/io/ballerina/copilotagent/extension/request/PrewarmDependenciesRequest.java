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

package io.ballerina.copilotagent.extension.request;

/**
 * Request to warm the standalone module-package caches for a package's direct
 * dependencies, so the first flow-model request of a review session does not pay the
 * one-time dependency resolution/compilation cost interactively.
 *
 * @param projectPath the package root (URI or filesystem path)
 * @since 1.5.0
 */
public record PrewarmDependenciesRequest(String projectPath) {
}
