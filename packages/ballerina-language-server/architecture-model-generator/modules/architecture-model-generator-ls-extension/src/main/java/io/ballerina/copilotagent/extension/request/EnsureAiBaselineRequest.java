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

import java.util.List;

/**
 * Request to (re)establish the ai:// frozen baseline of a package from explicit file
 * contents. Evicts any cached ai:// project for the path, reloads it, and applies the
 * given contents — all before the response resolves, so callers can rely on the baseline
 * being in place (unlike the fire-and-forget didOpen/didChange notification protocol).
 *
 * @param projectPath the package root (URI or filesystem path)
 * @param files       baseline contents to apply; paths are relative to projectPath.
 *                    May be empty to snapshot the package purely from disk.
 * @since 1.5.0
 */
public record EnsureAiBaselineRequest(String projectPath, List<BaselineFile> files) {

    /**
     * One file's frozen baseline content.
     *
     * @param filePath path relative to the package root
     * @param content  the exact baseline text for the file
     */
    public record BaselineFile(String filePath, String content) {
    }
}
