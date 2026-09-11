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

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.ServiceMetadata;
import io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Finds every listener module a project's default module actually attaches a {@code service} to --
 * deliberately narrower than "every resolved dependency", so a connector used only as a client (e.g. a
 * Salesforce client with no trigger) is never flagged for a connector-upgrade prompt it doesn't need.
 *
 * @since 1.3.0
 */
public final class ServiceListenerUsageScanner {

    private ServiceListenerUsageScanner() {
    }

    /**
     * Every distinct listener module used by a {@code service ... on <module>:Listener} declaration in
     * the project's default module, mapped to one file (relative to the package root) it was found in --
     * good enough for a "used in" hint without collecting every occurrence.
     */
    public static Map<ModuleInfo, String> findUsedListenerModules(Project project, SemanticModel semanticModel) {
        Map<ModuleInfo, String> found = new LinkedHashMap<>();
        Module defaultModule = project.currentPackage().getDefaultModule();
        for (DocumentId documentId : defaultModule.documentIds()) {
            Document document = defaultModule.document(documentId);
            ModulePartNode modulePartNode = document.syntaxTree().rootNode();
            for (ModuleMemberDeclarationNode member : modulePartNode.members()) {
                if (member.kind() != SyntaxKind.SERVICE_DECLARATION) {
                    continue;
                }
                ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) member;
                ServiceMetadata metadata = ServiceModelUtils.deriveServiceType(serviceNode, semanticModel);
                ModuleID moduleId = metadata.moduleId();
                if (moduleId == null) {
                    continue;
                }
                found.putIfAbsent(ModuleInfo.from(moduleId), document.name());
            }
        }
        return found;
    }
}
