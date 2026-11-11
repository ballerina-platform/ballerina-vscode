/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.ConfigVariableUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.projects.Document;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Represents configurable variable.
 *
 * @since 1.0.0
 */
public class ConfigVariableBuilder extends NodeBuilder {

    public static final String LABEL = "Config";
    public static final String DESCRIPTION = "Create a configurable variable";
    private static final String LS = System.lineSeparator();

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.CONFIG_VARIABLE);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        Optional<Property> variable = sourceBuilder.getProperty(Property.VARIABLE_KEY);
        if (variable.isEmpty()) {
            throw new RuntimeException("Variable is not set for the configurable variable");
        }
        // Reading the type through the source builder also records the imports its type needs
        String type = sourceBuilder.getProperty(Property.TYPE_KEY)
                .map(sourceBuilder::requalifiedType)
                .orElse("");
        String defaultValue = sourceBuilder.getProperty(Property.DEFAULT_VALUE_KEY)
                .map(Property::toSourceCode)
                .orElse("");
        String documentation = sourceBuilder.getProperty(Property.CONFIG_VAR_DOC_KEY)
                .map(Property::toSourceCode)
                .orElse("");
        String statement = ConfigVariableUtil.constructConfigStatement(type, variable.get().toSourceCode(),
                defaultValue, documentation);

        Codedata codedata = sourceBuilder.flowNode.codedata();
        if (Boolean.TRUE.equals(codedata.isNew())) {
            // A configurable is a module-level declaration: a new one goes after everything else in the file, as
            // the configurable editor writes it, never at the position the form reports (the start of the file),
            // where it would sit above the imports.
            Document document = FileSystemUtils.getDocument(sourceBuilder.workspaceManager, sourceBuilder.filePath);
            Range endOfFile = CommonUtils.toRange(document.syntaxTree().rootNode().lineRange().endLine());
            sourceBuilder.token().skipFormatting().expression(LS + statement + LS);
            sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION, sourceBuilder.filePath, endOfFile);
        } else {
            sourceBuilder.token().skipFormatting().expression(statement);
            sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
        }
        return sourceBuilder.build();
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        properties().variableName("").expression("", Property.EXPRESSION_DOC);
    }
}
