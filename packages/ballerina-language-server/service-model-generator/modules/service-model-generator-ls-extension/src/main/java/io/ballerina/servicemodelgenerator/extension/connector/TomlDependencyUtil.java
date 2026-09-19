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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.projects.BallerinaToml;
import io.ballerina.toml.syntax.tree.DocumentNode;
import io.ballerina.toml.syntax.tree.SyntaxKind;
import io.ballerina.toml.syntax.tree.TableNode;
import org.ballerinalang.langserver.commons.toml.common.TomlSyntaxTreeUtil;

/**
 * {@code Ballerina.toml} reading helpers shared by the dependency-declaring utilities in this
 * package ({@link LocalDependencyEditUtil} and {@link PlatformDependencyEditUtil}), so the
 * insertion-point arithmetic only has to be fixed in one place.
 *
 * @since 1.8.0
 */
final class TomlDependencyUtil {

    private static final String PACKAGE_TABLE_NAME = "package";

    private TomlDependencyUtil() {
    }

    /**
     * The line a new dependency table array should be inserted at: just after the {@code [package]}
     * table, clamped to the end of the document so a manifest without one still gets a valid position.
     */
    static int getDependencyStartLine(BallerinaToml toml) {
        DocumentNode tomlSyntaxTree = toml.tomlDocument().syntaxTree().rootNode();
        int lastDocumentLine = tomlSyntaxTree.lineRange().endLine().line();
        int candidateLine = tomlSyntaxTree.members().stream()
                .filter(member -> member.kind().equals(SyntaxKind.TABLE)
                        && TomlSyntaxTreeUtil.toQualifiedName(((TableNode) member).identifier().value())
                                .equals(PACKAGE_TABLE_NAME))
                .findFirst()
                .map(member -> member.lineRange().endLine().line() + 2)
                .orElse(lastDocumentLine);
        return Math.min(candidateLine, lastDocumentLine);
    }

    /** Strips the surrounding quotes from a TOML basic-string value's source text. */
    static String unquote(String raw) {
        String trimmed = raw.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }
}
