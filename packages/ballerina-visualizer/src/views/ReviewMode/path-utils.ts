/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// Deep import: the core barrel pulls in ESM-only LS transport modules that jest cannot load.
import { isPathInside } from "@wso2/ballerina-core/lib/utils/path-utils";

/**
 * Semantic-diff URIs come from Java's `Path.toUri()` (`SemanticDiffComputer.resolveUri`), so they are
 * percent-encoded and three-slash — the latter leaving a leading slash before a Windows drive letter.
 */
export function toComparablePath(uri: string): string {
    const withoutScheme = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    let decoded: string;
    try {
        decoded = decodeURIComponent(withoutScheme);
    } catch {
        decoded = withoutScheme;
    }
    return decoded.replace(/\\/g, "/").replace(/^\/(?=[A-Za-z]:)/, "");
}

export function diffBelongsToPackage(uri: string, packagePath: string): boolean {
    // isPathInside normalises the drive letter and trailing slashes, but not separators.
    return isPathInside(packagePath.replace(/\\/g, "/"), toComparablePath(uri));
}
