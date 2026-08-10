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
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The authoritative gate every model passes through before source is generated. The webview's live
 * {@code common.*} pass is advisory only — the client is untrusted — so this re-check is the one that
 * decides whether edits are produced.
 *
 * @since 1.8.0
 */
public final class SaveTimeValidator {

    private SaveTimeValidator() {
    }

    private static final ValidationEngine ENGINE = ValidationEngine.withAllRules();

    /** Validates a model's property tree, plus any additional standalone nodes (e.g. a function name). */
    public static List<ValidationResult> validate(Map<String, Value> properties, ValidationContext context,
                                                  Map<String, Value> extraNodes) {
        List<ValidationResult> results = new ArrayList<>(ENGINE.validate(properties, context));
        if (extraNodes != null) {
            extraNodes.forEach((path, node) -> {
                if (node != null) {
                    results.addAll(ENGINE.validateNode(node, path, context));
                }
            });
        }
        return results;
    }

    public static List<ValidationResult> validate(Map<String, Value> properties, ValidationContext context) {
        return validate(properties, context, null);
    }

    /** Whether the results block generation. WARNINGs never do. */
    public static boolean blocksGeneration(List<ValidationResult> results) {
        return results.stream().anyMatch(ValidationResult::isError);
    }

    public static ValidationContext context(SemanticModel semanticModel, Project project, Document document,
                                            String moduleName) {
        return new ValidationContext(semanticModel, project, document, moduleName);
    }
}
