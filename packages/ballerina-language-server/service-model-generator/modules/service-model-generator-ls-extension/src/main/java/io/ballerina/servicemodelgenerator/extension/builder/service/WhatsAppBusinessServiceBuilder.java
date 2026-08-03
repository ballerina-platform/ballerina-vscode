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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.openapi.core.generators.common.exception.BallerinaOpenApiException;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.ballerinalang.formatter.core.FormatterException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.WHATSAPP_BUSINESS;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.resolveImportPrefix;

/**
 * Builder class for WhatsApp Business event-integration service.
 *
 * @since 1.8.0
 */
public class WhatsAppBusinessServiceBuilder extends AbstractServiceBuilder {

    private static final String ALIAS = "whatsapp";
    private static final String LISTENER_TYPE_NAME = "Listener";
    private static final String SERVICE_TYPE_NAME = "WhatsAppService";
    // Both config fields are required by the listener's closed ListenerConfig record.
    private static final List<String> CONFIG_FIELDS = List.of("verifyToken", "appSecret");
    private static final String ALIASED_IMPORT_TEMPLATE = "%nimport %s/%s as %s;%n";

    @Override
    public String kind() {
        return WHATSAPP_BUSINESS;
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context)
            throws WorkspaceDocumentException, FormatterException, IOException, BallerinaOpenApiException,
            EventSyncException {
        ServiceInitModel serviceInitModel = context.serviceInitModel();
        Map<String, Value> properties = serviceInitModel.getProperties();
        String listenerVarName = properties.get(KEY_LISTENER_VAR_NAME).getValue();

        // `listenOn` is the positional port; verifyToken/appSecret are named ListenerConfig args.
        List<String> args = new ArrayList<>();
        String listenOn = getPropertyValue(properties, "listenOn");
        if (!listenOn.isEmpty()) {
            args.add(listenOn);
        }
        for (String field : CONFIG_FIELDS) {
            addNamedArg(args, properties, field);
        }

        String orgName = serviceInitModel.getOrgName();
        String moduleName = serviceInitModel.getModuleName();
        ModulePartNode modulePartNode = context.document().syntaxTree().rootNode();
        // Reuse the existing import's prefix (whether aliased or its implicit default) so the generated
        // code always matches what's actually in scope, instead of assuming our own `whatsapp` alias.
        String modulePrefix = resolveImportPrefix(modulePartNode, orgName, moduleName, ALIAS);
        String listenerType = modulePrefix + ":" + LISTENER_TYPE_NAME;
        String serviceType = modulePrefix + ":" + SERVICE_TYPE_NAME;

        String listenerDeclaration = String.format("listener %s %s = new (%s);",
                listenerType, listenerVarName, String.join(", ", args));
        String serviceCode = NEW_LINE
                + listenerDeclaration
                + NEW_LINE
                + SERVICE + SPACE + serviceType + SPACE + ON + SPACE + listenerVarName + SPACE
                + OPEN_BRACE
                + NEW_LINE
                + CLOSE_BRACE + NEW_LINE;

        List<TextEdit> edits = new ArrayList<>();
        if (!importExists(modulePartNode, orgName, moduleName)) {
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()),
                    String.format(ALIASED_IMPORT_TEMPLATE, orgName, moduleName, ALIAS)));
        }
        edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), serviceCode));
        return Map.of(context.filePath(), edits);
    }

    private static void addNamedArg(List<String> args, Map<String, Value> properties, String key) {
        String value = getPropertyValue(properties, key);
        if (!value.isEmpty()) {
            args.add(key + " = " + value);
        }
    }

    private static String getPropertyValue(Map<String, Value> properties, String key) {
        Value property = properties.get(key);
        if (property != null && property.getValue() != null && !property.getValue().isEmpty()) {
            return property.getValue();
        }
        return "";
    }
}
