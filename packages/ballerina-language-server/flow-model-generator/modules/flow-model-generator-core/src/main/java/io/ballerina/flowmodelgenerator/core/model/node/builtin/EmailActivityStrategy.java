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

package io.ballerina.flowmodelgenerator.core.model.node.builtin;

import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Strategy for the {@code activity:sendEmail} builtin activity. SMTP host/port/credentials
 * live on the {@code email:SmtpClient} connection now; only the per-message fields are
 * surfaced here.
 *
 * @since 1.8.0
 */
public class EmailActivityStrategy implements BuiltinActivityStrategy {

    // Property keys (match the parameter names / EmailOptions fields of activity:sendEmail)
    public static final String TO_KEY = "to";
    public static final String SUBJECT_KEY = "subject";
    public static final String FROM_KEY = "from";
    public static final String BODY_KEY = "body";
    // EmailOptions fields (wrapped in options: {...} in source)
    public static final String CC_KEY = "cc";
    public static final String BCC_KEY = "bcc";
    public static final String HTML_BODY_KEY = "htmlBody";
    public static final String CONTENT_TYPE_KEY = "contentType";
    public static final String EMAIL_HEADERS_KEY = "emailHeaders";
    public static final String REPLY_TO_KEY = "replyTo";
    public static final String SENDER_KEY = "sender";

    // Ballerina parameter name — `from` is a reserved keyword, must be quoted
    private static final String FROM_PARAM = "'from";

    private static final String STRING_TYPE = "string";
    private static final String STRING_OR_STRING_ARRAY = "string|string[]";
    private static final String OPTIONAL_STRING = "string?";
    private static final String OPTIONAL_STRING_OR_STRING_ARRAY = "string|string[]?";
    private static final String OPTIONAL_MAP_STRING = "map<string>?";

    private static final String STRATEGY_LABEL = "Send Email";
    private static final String STRATEGY_DESCRIPTION =
            "Send a plain-text email as a workflow activity using a configured email:SmtpClient connection.";

    public static final String EMAIL_PKG_ORG = "ballerina";
    public static final String EMAIL_PKG_MODULE = "email";

    @Override
    public void setFormProperties(NodeBuilder nodeBuilder, NodeBuilder.TemplateContext context) {
        // to/subject/'from/body — required, each plain text by default and switchable to an
        // expression. The order matches the sendEmail signature, getCallActivityArgs below, and
        // CodeAnalyzer.populateEmailProperties: FormBuilder keeps properties in insertion order, so
        // it is the order the form renders in and a fresh node must agree with a reopened one.
        BuiltinActivityStrategy.addRequiredDualTypeProperty(nodeBuilder, TO_KEY,
                "To", "Recipient email address (or list of addresses)", STRING_OR_STRING_ARRAY);
        BuiltinActivityStrategy.addRequiredDualTypeProperty(nodeBuilder, SUBJECT_KEY,
                "Subject", "Email subject line", STRING_TYPE);
        // Ballerina keyword, quoted as 'from in source
        BuiltinActivityStrategy.addRequiredDualTypeProperty(nodeBuilder, FROM_KEY,
                "From", "Sender address", STRING_TYPE);
        BuiltinActivityStrategy.addRequiredDualTypeProperty(nodeBuilder, BODY_KEY,
                "Body", "Plain-text body of the email", STRING_TYPE);

        // --- EmailOptions fields (all optional, advanced) ---

        // CC — optional string|string[]?
        nodeBuilder.properties().custom()
                .metadata()
                    .label("CC")
                    .description("Optional CC recipient(s)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING_OR_STRING_ARRAY)
                    .selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(CC_KEY);

        // BCC — optional string|string[]?
        nodeBuilder.properties().custom()
                .metadata()
                    .label("BCC")
                    .description("Optional BCC recipient(s)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING_OR_STRING_ARRAY)
                    .selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(BCC_KEY);

        // HTML Body — optional string?
        nodeBuilder.properties().custom()
                .metadata()
                    .label("HTML Body")
                    .description("Optional HTML body (sent alongside the plain-text body)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING).selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(HTML_BODY_KEY);

        // Content Type — optional string?
        nodeBuilder.properties().custom()
                .metadata()
                    .label("Content Type")
                    .description("MIME content type override (e.g., \"text/plain\")")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING).selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(CONTENT_TYPE_KEY);

        // Headers — optional map<string>? (email-specific headers)
        nodeBuilder.properties().custom()
                .metadata()
                    .label("Email Headers")
                    .description("Additional mail headers as map<string>")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(OPTIONAL_MAP_STRING).selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(EMAIL_HEADERS_KEY);

        // Reply-To — optional string|string[]?
        nodeBuilder.properties().custom()
                .metadata()
                    .label("Reply To")
                    .description("Optional Reply-To address(es)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING_OR_STRING_ARRAY)
                    .selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(REPLY_TO_KEY);

        // Sender — optional string?
        nodeBuilder.properties().custom()
                .metadata()
                    .label("Sender")
                    .description("Sender address (used when the envelope sender differs from From)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING).selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(SENDER_KEY);
    }

    @Override
    public String activityFunctionSymbol() {
        return "sendEmail";
    }

    @Override
    public String searchNodesKind() {
        return "EMAIL";
    }

    @Override
    public List<Metadata.AllowedConnector> connectors() {
        Codedata smtpConnector = new Codedata.Builder<>(null)
                .node(NodeKind.NEW_CONNECTION)
                .org(EMAIL_PKG_ORG).module(EMAIL_PKG_MODULE).packageName(EMAIL_PKG_MODULE)
                .object("SmtpClient").symbol("init")
                .build();
        return List.of(new Metadata.AllowedConnector(smtpConnector, "Add new SMTP connection"));
    }

    @Override
    public String connectionBallerinaType() {
        return "email:SmtpClient";
    }

    @Override
    public List<String> getCallActivityArgs(SourceBuilder sourceBuilder) {
        Map<String, Property> props = sourceBuilder.flowNode.properties();
        List<String> args = new ArrayList<>();
        // Required params (order matches sendEmail signature). Each is TEXT/EXPRESSION dual-typed:
        // TEXT input is emitted as a quoted string literal, EXPRESSION input verbatim.
        BuiltinActivityStrategy.addQuotedArg(args, "to", props, TO_KEY);
        BuiltinActivityStrategy.addQuotedArg(args, "subject", props, SUBJECT_KEY);
        BuiltinActivityStrategy.addQuotedArg(args, FROM_PARAM, props, FROM_KEY);
        BuiltinActivityStrategy.addQuotedArg(args, "body", props, BODY_KEY);
        // Optional EmailOptions fields — nested in options: {...}. These are EXPRESSION-only, so
        // addQuotedArg emits them verbatim; it is used for all of them regardless, rather than a
        // near-identical local helper whose parameters sit in a different order.
        List<String> optFields = new ArrayList<>();
        BuiltinActivityStrategy.addQuotedArg(optFields, "cc", props, CC_KEY);
        BuiltinActivityStrategy.addQuotedArg(optFields, "bcc", props, BCC_KEY);
        BuiltinActivityStrategy.addQuotedArg(optFields, "htmlBody", props, HTML_BODY_KEY);
        BuiltinActivityStrategy.addQuotedArg(optFields, "contentType", props, CONTENT_TYPE_KEY);
        BuiltinActivityStrategy.addQuotedArg(optFields, "headers", props, EMAIL_HEADERS_KEY);
        BuiltinActivityStrategy.addQuotedArg(optFields, "replyTo", props, REPLY_TO_KEY);
        BuiltinActivityStrategy.addQuotedArg(optFields, "sender", props, SENDER_KEY);
        if (!optFields.isEmpty()) {
            args.add("options: {" + String.join(", ", optFields) + "}");
        }
        return args;
    }

    @Override
    public List<Import> getRequiredImports(SourceBuilder sourceBuilder) {
        return List.of(new Import(EMAIL_PKG_ORG, EMAIL_PKG_MODULE));
    }

    @Override
    public String getLabel() {
        return STRATEGY_LABEL;
    }

    @Override
    public String getDescription() {
        return STRATEGY_DESCRIPTION;
    }
}
