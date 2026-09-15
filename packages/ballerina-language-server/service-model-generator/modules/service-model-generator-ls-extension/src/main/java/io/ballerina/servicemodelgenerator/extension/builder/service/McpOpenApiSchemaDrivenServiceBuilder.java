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
 *  KIND, either express or implied. See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.servicemodelgenerator.extension.builder.service;

import com.google.gson.Gson;
import com.google.gson.stream.JsonReader;
import io.ballerina.mcp.core.generator.McpGenerationException;
import io.ballerina.servicemodelgenerator.extension.core.McpOpenApiServiceGenerator;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROPERTY_DESIGN_APPROACH;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.applyEnabledChoiceProperty;

/**
 * Adds OpenAPI import to the schema-driven MCP creation flow while leaving ordinary MCP service
 * generation to {@link SchemaDrivenServiceBuilder}.
 */
public class McpOpenApiSchemaDrivenServiceBuilder extends SchemaDrivenServiceBuilder {

    private static final String DESIGN_APPROACH_RESOURCE = "services/mcp_design_approach.json";

    @Override
    public ServiceInitModel getServiceInitModel(GetServiceInitModelContext context) {
        ServiceInitModel model = super.getServiceInitModel(context);
        if (model == null) {
            return null;
        }
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream(DESIGN_APPROACH_RESOURCE)) {
            if (stream == null) {
                return model;
            }
            Value designApproach = new Gson().fromJson(new JsonReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8)), Value.class);
            Map<String, Value> properties = new LinkedHashMap<>(model.getProperties());
            model.getProperties().clear();
            model.addProperty(PROPERTY_DESIGN_APPROACH, designApproach);
            model.addProperties(properties);
        } catch (IOException ignored) {
            // The schema-driven creation form remains available if the optional import model is absent.
        }
        return model;
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context) {
        ServiceInitModel model = context.serviceInitModel();
        applyEnabledChoiceProperty(model, PROPERTY_DESIGN_APPROACH);
        Value spec = model.getOpenAPISpec();
        if (spec == null || spec.getValue() == null || spec.getValue().isBlank()) {
            return super.addServiceInitSource(context);
        }
        try {
            return new McpOpenApiServiceGenerator(Path.of(spec.getValue()), context.project().sourceRoot())
                    .generateService(model);
        } catch (McpGenerationException | IOException error) {
            throw new RuntimeException("Failed to generate MCP service from OpenAPI specification: "
                    + error.getMessage(), error);
        }
    }
}
