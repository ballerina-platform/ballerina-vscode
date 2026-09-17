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

import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.TomlDocument;

import java.util.Objects;
import java.util.Optional;

/**
 * Discriminated union of resolved Ballerina compiler objects for a given URI.
 *
 * <p>Each variant carries exactly the object that the URI resolves to — no nulls,
 * no mixed concerns. Use pattern matching to handle each case at the call site.</p>
 *
 * @since 1.7.0
 */
public sealed interface ResolvedEntry
        permits ResolvedEntry.ProjectEntry,
                ResolvedEntry.ModuleEntry,
                ResolvedEntry.DocumentEntry,
                ResolvedEntry.ConfigEntry {
    /**
     * Returns the logical target type of this resolved entry.
     *
     * @return target type for trie discrimination
     */
    default TargetType targetType() {
        if (this instanceof ProjectEntry) {
            return TargetType.PROJECT;
        }
        if (this instanceof ModuleEntry) {
            return TargetType.MODULE;
        }
        if (this instanceof DocumentEntry) {
            return TargetType.DOCUMENT;
        }
        return TargetType.CONFIG;
    }
    /**
     * A URI that resolves to a Ballerina project root.
     *
     * @param project resolved project
     */
    record ProjectEntry(Project project) implements ResolvedEntry {
    }

    /**
     * A URI that resolves to a Ballerina module.
     *
     * @param module resolved module
     */
    record ModuleEntry(Module module) implements ResolvedEntry {
    }

    /**
     * A URI that resolves to a Ballerina source document.
     *
     * @param document resolved source document
     */
    record DocumentEntry(Document document) implements ResolvedEntry {
    }

    /**
     * A URI that resolves to a TOML config file
     * (e.g. {@code Ballerina.toml}, {@code Dependencies.toml}).
     */
    final class ConfigEntry implements ResolvedEntry {

        private final TomlDocument config;
        private final Project project;

        public ConfigEntry(TomlDocument config) {
            this(config, null);
        }

        public ConfigEntry(TomlDocument config, Project project) {
            this.config = Objects.requireNonNull(config, "config must not be null");
            this.project = project;
        }

        public TomlDocument config() {
            return config;
        }

        public Optional<Project> project() {
            return Optional.ofNullable(project);
        }

        @Override
        public boolean equals(Object obj) {
            if (this == obj) {
                return true;
            }
            if (!(obj instanceof ConfigEntry other)) {
                return false;
            }
            return Objects.equals(config, other.config) && Objects.equals(project, other.project);
        }

        @Override
        public int hashCode() {
            return Objects.hash(config, project);
        }
    }
}
