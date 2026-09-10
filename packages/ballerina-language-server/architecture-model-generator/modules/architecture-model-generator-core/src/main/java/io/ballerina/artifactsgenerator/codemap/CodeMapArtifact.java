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

import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Represents a code artifact extracted from Ballerina source code for the codeMap.
 *
 * @param name       the name of the artifact
 * @param type       the type of the artifact (e.g., function, service, class)
 * @param range      the range in source code where this artifact is located
 * @param properties additional properties of the artifact
 * @param children   nested artifacts contained within this artifact
 * @since 1.8.0
 */
public record CodeMapArtifact(String name, String type, Range range,
                              Map<String, Object> properties, List<CodeMapArtifact> children) {

    // Property key constants
    private static final String MODIFIERS = "modifiers";
    private static final String DOCUMENTATION = "documentation";
    private static final String COMMENT = "comment";


    /**
     * Converts a Ballerina LineRange to an LSP4J Range.
     *
     * @param lineRange the Ballerina line range
     * @return the corresponding LSP4J Range
     */
    public static Range toRange(LineRange lineRange) {
        return new Range(toPosition(lineRange.startLine()), toPosition(lineRange.endLine()));
    }

    /**
     * Converts a Ballerina LinePosition to an LSP4J Position.
     *
     * @param linePosition the Ballerina line position
     * @return the corresponding LSP4J Position
     */
    public static Position toPosition(LinePosition linePosition) {
        return new Position(linePosition.line(), linePosition.offset());
    }

    public CodeMapArtifact {
        properties = Collections.unmodifiableMap(properties);
        children = Collections.unmodifiableList(children);
    }

    /**
     * Builder class for constructing {@link CodeMapArtifact} instances.
     */
    public static class Builder {
        private String name;
        private String type;
        private Range range;
        private final Map<String, Object> properties = new HashMap<>();
        private final List<CodeMapArtifact> children = new ArrayList<>();

        /**
         * Creates a new Builder initialized with the line range from the given syntax node.
         *
         * @param node the syntax node to extract line range from
         */
        public Builder(Node node) {
            this.range = toRange(node.lineRange());
        }

        public Builder name(String name) {
            this.name = name;
            return this;
        }

        public Builder type(String type) {
            this.type = type;
            return this;
        }

        public Builder modifiers(List<String> modifiers) {
            if (!modifiers.isEmpty()) {
                this.properties.put(MODIFIERS, new ArrayList<>(modifiers));
            }
            return this;
        }

        public Builder addProperty(String key, Object value) {
            this.properties.put(key, value);
            return this;
        }

        public Builder addChild(CodeMapArtifact child) {
            this.children.add(child);
            return this;
        }

        public Builder documentation(String documentation) {
            return addProperty(DOCUMENTATION, documentation);
        }

        public Builder comment(String comment) {
            return addProperty(COMMENT, comment);
        }

        /**
         * Builds and returns the {@link CodeMapArtifact} instance.
         *
         * @return the constructed CodeMapArtifact
         */
        public CodeMapArtifact build() {
            return new CodeMapArtifact(name, type, range,
                    new HashMap<>(properties), new ArrayList<>(children));
        }
    }
}
