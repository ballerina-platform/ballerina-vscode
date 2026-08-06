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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;

import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FTP;

/**
 * Shared FTP annotation resolution, used by {@link FTPListenerUtil}. The function-model
 * synchronization and post-process-action mapping this class used to carry (for the FTP
 * service/function source-extraction builders) were removed with those builders once every
 * connector with a bundled TriggerUISchemaModel schema — FTP included — moved onto the generic
 * schema-driven builders.
 *
 * @since 1.6.0
 */
public final class FTPFunctionModelUtil {

    private FTPFunctionModelUtil() {
    }

    /**
     * Shared FTP annotation resolver used by FTP service/function builders.
     * Supports semantic-model-based checks with source-text fallbacks.
     */
    public static Optional<AnnotationNode> findFtpAnnotation(NodeList<AnnotationNode> annotations,
                                                              String annotationName,
                                                              SemanticModel semanticModel) {
        for (AnnotationNode annotation : annotations) {
            if (isMatchingFtpAnnotation(annotation, annotationName, semanticModel)) {
                return Optional.of(annotation);
            }
        }
        return Optional.empty();
    }

    private static boolean isMatchingFtpAnnotation(AnnotationNode annotation, String annotationName,
                                                   SemanticModel semanticModel) {
        if (semanticModel != null) {
            Optional<Symbol> symbol = semanticModel.symbol(annotation);
            if (symbol.orElse(null) instanceof AnnotationSymbol annotationSymbol) {
                Optional<ModuleSymbol> module = annotationSymbol.getModule();
                if (module.isPresent() && annotationSymbol.getName().isPresent()
                        && annotationName.equals(annotationSymbol.getName().get())) {
                    String orgName = module.get().id().orgName();
                    String packageName = module.get().id().packageName();
                    String moduleName = module.get().id().moduleName();
                    return BALLERINA.equals(orgName) && (FTP.equals(packageName) || FTP.equals(moduleName));
                }
            }
        }

        if (annotation.annotReference() instanceof QualifiedNameReferenceNode qualifiedName) {
            return FTP.equals(qualifiedName.modulePrefix().text())
                    && annotationName.equals(qualifiedName.identifier().text().trim());
        }

        String annotationText = annotation.annotReference().toString().trim();
        return annotationText.endsWith(annotationName);
    }
}
