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

package io.ballerina.servicemodelgenerator.extension.builder.service.agent;

import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator.HandlerParameter;

import java.util.List;
import java.util.stream.Collectors;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;

/**
 * Builds the {@code string prompt} statement an agent trigger passes to {@code agent.run}.
 *
 * @since 1.9.0
 */
final class AgentPromptBuilder {

    private static final String XML_TYPE = "xml";
    private static final String STRING_TYPE = "string";

    private static final String PROMPT_STATEMENT = """
            string prompt = string `{{instructions}}

            {{payload}}`;""";

    private AgentPromptBuilder() {
    }

    static String promptStatement(String instructions, String defaultInstructions, String soleLabel,
                                  List<HandlerParameter> parameters) {
        return PROMPT_STATEMENT
                .replace("{{instructions}}", escapeTemplate(instructions, defaultInstructions))
                .replace("{{payload}}", payloadSection(parameters, soleLabel));
    }

    private static String payloadSection(List<HandlerParameter> parameters, String soleLabel) {
        List<HandlerParameter> carried = parameters.stream().filter(HandlerParameter::carries).toList();
        if (carried.isEmpty()) {
            return "";
        }
        if (carried.size() == 1) {
            return soleLabel + ":" + NEW_LINE + interpolate(carried.getFirst());
        }
        return carried.stream()
                .map(parameter -> parameter.name() + ":" + NEW_LINE + interpolate(parameter))
                .collect(Collectors.joining(NEW_LINE + NEW_LINE));
    }

    private static String interpolate(HandlerParameter parameter) {
        String type = parameter.type().strip();
        if (STRING_TYPE.equals(type)) {
            return "${" + parameter.name() + "}";
        }
        String conversion = XML_TYPE.equals(type) || type.startsWith(XML_TYPE + "<") ? ".toString()"
                : ".toJsonString()";
        return "${" + parameter.name() + conversion + "}";
    }

    private static String escapeTemplate(String instructions, String defaultInstructions) {
        String text = instructions == null || instructions.isBlank() ? defaultInstructions : instructions.strip();
        return text.replace("${", "${\"$\"}{").replace("`", "${\"`\"}");
    }
}
