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

package io.ballerina.servicemodelgenerator.extension.validation;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

/**
 * An immutable snapshot of the project context a validation run may consult. Every field is nullable,
 * so pure {@code common.*} rules still run when no project is available.
 *
 * @param semanticModel the current semantic model, or {@code null} when unavailable
 * @param project       the enclosing project, or {@code null} when unavailable
 * @param document       the document being edited, or {@code null} when unavailable
 * @param moduleName    the module the edited construct belongs to
 * @param serviceNode   the enclosing service node, or {@code null} outside a service
 * @param editedRange where the construct being edited currently lives, or {@code null} for an add.
 *                    Lets uniqueness rules distinguish "collides with something else" from "is itself" —
 *                    without it, re-saving an unrenamed construct would report a collision with itself.
 * @since 1.8.0
 */
public record ValidationContext(SemanticModel semanticModel, Project project, Document document, String moduleName,
                                NonTerminalNode serviceNode, LineRange editedRange) {

    public ValidationContext(SemanticModel semanticModel, Project project, Document document, String moduleName) {
        this(semanticModel, project, document, moduleName, null, null);
    }

    public ValidationContext(SemanticModel semanticModel, Project project, Document document, String moduleName,
                             NonTerminalNode serviceNode) {
        this(semanticModel, project, document, moduleName, serviceNode, null);
    }

    /** A context with no project information — enough to run every {@code common.*} rule. */
    public static ValidationContext empty() {
        return new ValidationContext(null, null, null, null, null, null);
    }

    public boolean hasSemanticModel() {
        return semanticModel != null;
    }
}
