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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.COMMA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.MCP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TAB;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_TABS;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getImportStmt;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;

public class McpServiceBuilder extends AbstractServiceBuilder {

    // Transport-explicit MCP types introduced by the Streamable HTTP transport work. New services are
    // generated with these; older mcp:Service / mcp:Listener / @mcp:ServiceConfig services still work.
    private static final String MCP_STREAMABLE_HTTP_SERVICE_CLASS_NAME = "StreamableHttpService";
    private static final String MCP_STREAMABLE_HTTP_LISTENER_CLASS_NAME = "StreamableHttpListener";
    private static final String MCP_STREAMABLE_HTTP_SERVICE_CONFIG = "StreamableHttpServiceConfig";
    private static final String SERVICE_NAME_PROPERTY = "serviceName";
    private static final String VERSION_PROPERTY = "version";

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context) {
        ServiceInitModel serviceInitModel = context.serviceInitModel();
        Map<String, Value> properties = serviceInitModel.getProperties();
        ModulePartNode modulePartNode = context.document().syntaxTree().rootNode();

        ListenerDTO result = buildListenerDTO(context, MCP_STREAMABLE_HTTP_LISTENER_CLASS_NAME);

        String serviceName = properties.get(SERVICE_NAME_PROPERTY).getValue();
        String version = properties.get(VERSION_PROPERTY).getValue();

        String serviceDeclaration = NEW_LINE +
                result.listenerDeclaration() + NEW_LINE +
                buildServiceConfig(serviceName, version) +
                SERVICE + SPACE +
                serviceInitModel.getModuleName() + COLON + MCP_STREAMABLE_HTTP_SERVICE_CLASS_NAME + SPACE +
                serviceInitModel.getBasePath(result.listenerProtocol()) + SPACE +
                ON + SPACE + result.listenerVarName() + SPACE + OPEN_BRACE +
                TWO_NEW_LINES + CLOSE_BRACE + NEW_LINE;

        List<TextEdit> edits = new ArrayList<>();
        if (!importExists(modulePartNode, serviceInitModel.getOrgName(), serviceInitModel.getModuleName())) {
            String importText = getImportStmt(serviceInitModel.getOrgName(), serviceInitModel.getModuleName());
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), importText));
        }
        edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), serviceDeclaration));

        return Map.of(context.filePath(), edits);
    }

    @Override
    public String kind() {
        return MCP;
    }

    private String buildServiceConfig(String name, String version) {
        return "@" + MCP + COLON + MCP_STREAMABLE_HTTP_SERVICE_CONFIG + SPACE + OPEN_BRACE + NEW_LINE +
                TAB + "info: " + OPEN_BRACE + NEW_LINE +
                TWO_TABS + "name: " + name + COMMA + NEW_LINE +
                TWO_TABS + "version: " + version + NEW_LINE +
                TAB + CLOSE_BRACE + NEW_LINE +
                CLOSE_BRACE + NEW_LINE;
    }
}
