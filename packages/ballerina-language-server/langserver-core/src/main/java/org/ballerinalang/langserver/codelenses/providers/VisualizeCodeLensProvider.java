/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package org.ballerinalang.langserver.codelenses.providers;

import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.projects.Module;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.codelenses.CodeLensUtil;
import org.ballerinalang.langserver.common.utils.PositionUtil;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.eclipse.lsp4j.CodeLens;
import org.eclipse.lsp4j.Command;
import org.eclipse.lsp4j.Range;

import java.util.Arrays;
import java.util.List;

/**
 * Code lens provider for visualizing module-level constructs such as functions, services, classes.
 *
 * @since 1.0.1
 */
@JavaSPIService("org.ballerinalang.langserver.commons.codelenses.spi.LSCodeLensesProvider")
public class VisualizeCodeLensProvider extends AbstractCodeLensesProvider {

    public VisualizeCodeLensProvider() {
        super("visualize.CodeLenses");
    }

    @Override
    public boolean isEnabled(LanguageServerContext serverContext) {
        return true;
    }

    @Override
    public CodeLens getLens(DocumentServiceContext context, Node node) {
        switch (node.kind()) {
            case FUNCTION_DEFINITION:
            case SERVICE_DECLARATION:
            case CLASS_DEFINITION:
            case TYPE_DEFINITION:
            case RESOURCE_ACCESSOR_DEFINITION:
            case OBJECT_METHOD_DEFINITION:
                break;
            default:
                return null;
        }

        if (!context.currentModule().map(Module::isDefaultModule).orElse(true)) {
            return null;
        }

        Range range = PositionUtil.toRange(node.lineRange());
        List<Object> args = Arrays.asList(context.fileUri(), range);
        Command command = new Command(CodeLensUtil.VISUALIZE_CODELENS, "ballerina.showVisualizer", args);
        return CodeLensUtil.getCodeLens(command, node);
    }
}
