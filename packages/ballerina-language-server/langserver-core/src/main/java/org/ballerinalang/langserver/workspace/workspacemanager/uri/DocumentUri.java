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

package org.ballerinalang.langserver.workspace.workspacemanager.uri;

import java.net.URI;

/**
 * Represents document identity using supported URI schemes.
 *
 * @since 1.7.0
 */
public sealed interface DocumentUri permits DocumentUri.FileUri, DocumentUri.ExprUri, DocumentUri.AiUri {
    /**
     * Returns the URI identity.
     *
     * @return URI value
     */
    URI uri();

    /**
     * Identity for {@code file://} documents.
     *
     * @param uri document URI
     */
    record FileUri(URI uri) implements DocumentUri {
        /**
         * Creates a file URI identity.
         */
        public FileUri {
            if (!"file".equals(uri.getScheme())) {
                throw new IllegalArgumentException("Expected URI scheme 'file' but found '" + uri.getScheme() + "'");
            }
        }

        @Override
        public boolean equals(Object obj) {
            if (this == obj) {
                return true;
            }
            if (!(obj instanceof FileUri other)) {
                return false;
            }
            return canonicalFileUri(uri).equals(canonicalFileUri(other.uri));
        }

        @Override
        public int hashCode() {
            return canonicalFileUri(uri).hashCode();
        }

        private static URI canonicalFileUri(URI fileUri) {
            String rawPath = fileUri.getRawPath();
            if (rawPath == null || rawPath.length() <= 1 || !rawPath.endsWith("/")
                    || isWindowsDriveRoot(rawPath)) {
                return fileUri;
            }

            int stripCount = 0;
            while (rawPath.length() - stripCount > 1
                    && rawPath.charAt(rawPath.length() - stripCount - 1) == '/') {
                stripCount++;
            }
            if (stripCount == 0) {
                return fileUri;
            }

            String rawUri = fileUri.toString();
            int pathEnd = rawUri.length();
            int queryStart = rawUri.indexOf('?');
            if (queryStart >= 0) {
                pathEnd = queryStart;
            }
            int fragmentStart = rawUri.indexOf('#');
            if (fragmentStart >= 0 && fragmentStart < pathEnd) {
                pathEnd = fragmentStart;
            }
            return URI.create(rawUri.substring(0, pathEnd - stripCount) + rawUri.substring(pathEnd));
        }

        private static boolean isWindowsDriveRoot(String rawPath) {
            return rawPath.length() == 4
                    && rawPath.charAt(0) == '/'
                    && Character.isLetter(rawPath.charAt(1))
                    && rawPath.charAt(2) == ':'
                    && rawPath.charAt(3) == '/';
        }
    }

    /**
     * Identity for {@code expr://} documents.
     *
     * @param uri document URI
     */
    record ExprUri(URI uri) implements DocumentUri {
        /**
         * Creates an expr URI identity.
         */
        public ExprUri {
            if (!"expr".equals(uri.getScheme())) {
                throw new IllegalArgumentException("Expected URI scheme 'expr' but found '" + uri.getScheme() + "'");
            }
        }
    }

    /**
     * Identity for {@code ai://} documents.
     *
     * @param uri document URI
     */
    record AiUri(URI uri) implements DocumentUri {
        /**
         * Creates an AI URI identity.
         */
        public AiUri {
            if (!"ai".equals(uri.getScheme())) {
                throw new IllegalArgumentException("Expected URI scheme 'ai' but found '" + uri.getScheme() + "'");
            }
        }
    }
}
