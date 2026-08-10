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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.servicemodelgenerator.extension.model.MetaData;

/**
 * Represents constants for the trigger model generator service.
 *
 * @since 1.0.0
 */
public class Constants {

    public static final String CAPABILITY_NAME = "serviceModel";
    public static final String DOUBLE_QUOTE = "\"";
    public static final String TAB = "\t";
    public static final String TWO_TABS = TAB + TAB;
    public static final String SPACE = " ";
    public static final String OPEN_BRACE = "{";
    public static final String CLOSE_BRACE = "}";
    public static final String OPEN_PAREN = "(";
    public static final String CLOSE_PAREN = ")";
    public static final String NEW_LINE = System.lineSeparator();
    public static final String TWO_NEW_LINES = NEW_LINE + NEW_LINE;
    public static final String NEW_LINE_WITH_TAB = NEW_LINE + TAB;
    public static final String IMPORT_STMT_TEMPLATE = "%nimport %s/%s;%n";
    public static final String IMPORT_STMT_TEMPLATE_WITH_ALIAS = "%nimport %s/%s as %s;%n";
    public static final String AT = "@";
    public static final String COLON = ":";
    public static final String COMMA = ",";

    public static final String SINGLE_SELECT_VALUE = "SINGLE_SELECT";
    public static final String MULTIPLE_SELECT_VALUE = "MULTIPLE_SELECT";
    public static final String HTTP_DEFAULT_LISTENER_ITEM_LABEL = "(+) Create and use the default HTTP listener" +
            " (port: 9090)";
    public static final String DEFAULT_LISTENER_ITEM_LABEL = "(+) Create and use a %s listener with " +
            "default configurations";
    public static final String DEFAULT_LISTENER_VAR_NAME = "%sDefaultListener";
    public static final String LISTENER_VAR_NAME = "%sListener";

    public static final String HTTP = "http";
    public static final String GRAPHQL = "graphql";
    public static final String TCP = "tcp";
    public static final String AI = "ai";
    public static final String MCP = "mcp";
    public static final String SOLACE = "solace";

    public static final String KAFKA = "kafka";
    public static final String RABBITMQ = "rabbitmq";
    public static final String MQTT = "mqtt";
    public static final String ASB = "asb";
    public static final String SF = "salesforce";
    public static final String TRIGGER_GITHUB = "trigger.github";
    public static final String TRIGGER_SHOPIFY = "trigger.shopify";
    public static final String TRIGGER_TWILIO = "trigger.twilio";
    public static final String SOLACE_JMS = "solace.jms";
    public static final String TRIGGER_HUBSPOT = "trigger.hubspot";
    public static final String MSSQL = "mssql";
    public static final String POSTGRESQL = "postgresql";
    public static final String MYSQL = "mysql";

    public static final String FTP = "ftp";
    public static final String FILE = "file";

    public static final String PROPERTY_REQUIRED_FUNCTIONS = "requiredFunctions";
    public static final String PROPERTY_DESIGN_APPROACH = "designApproach";
    public static final String PROPERTY_NAME = "name";
    public static final String PROPERTY_BASE_PATH = "basePath";

    public static final String KIND_QUERY = "QUERY";
    public static final String KIND_MUTATION = "MUTATION";
    public static final String KIND_SUBSCRIPTION = "SUBSCRIPTION";
    public static final String KIND_RESOURCE = "RESOURCE";
    public static final String KIND_REMOTE = "REMOTE";
    public static final String KIND_DEFAULT = "DEFAULT";
    public static final String KIND_REQUIRED = "REQUIRED";
    public static final String KIND_DEFAULTABLE = "DEFAULTABLE";
    public static final String KIND_OBJECT_METHOD = "OBJECT_METHOD";
    public static final String KIND_INCLUDED_RECORD = "INCLUDED_RECORD";

    public static final String PARAMETER = "parameter";
    public static final String SERVICE = "service";
    public static final String SERVICE_TYPE = "Service";
    public static final String RESOURCE = "resource";
    public static final String REMOTE = "remote";
    public static final String BASE_PATH = "basePath";
    public static final String ON = "on";
    public static final String SUBSCRIBE = "subscribe";
    public static final String GET = "get";
    public static final String INIT = "init";

    public static final String HTTP_SERVICE_TYPE = "http:Service";

    // different input boxes in the UI
    public static final String VALUE_TYPE_CONDITIONAL_FIELDS = "CONDITIONAL_FIELDS";

    public static final String DB_KIND_OPTIONAL = "OPTIONAL";

    public static final String CD_TYPE_ANNOTATION_ATTACHMENT = "ANNOTATION_ATTACHMENT";
    // Schema-driven (unified TriggerUISchemaModel) service-level annotation container, e.g. RabbitMQ's
    // `serviceConfig` (-> @rabbitmq:ServiceConfig). Distinct from CD_TYPE_ANNOTATION_ATTACHMENT, which
    // is the legacy hardcoded-builder convention (property keyed `annot<Name>`).
    public static final String CD_TYPE_SERVICE_ANNOTATION = "SERVICE_ANNOTATION";
    public static final String CD_TYPE_INCLUDE_RECORD_PARAM = "INCLUDE_RECORD_PARAM";
    public static final String CD_TYPE_LISTENER_CONFIG = "LISTENER_CONFIG";

    public static final String ARG_TYPE_LISTENER_VAR_NAME = "LISTENER_VAR_NAME";
    public static final String ARG_TYPE_LISTENER_PARAM_REQUIRED = "LISTENER_PARAM_REQUIRED";
    public static final String ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD = "LISTENER_PARAM_INCLUDED_FIELD";
    public static final String ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD =
            "LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD";
    // Use this argument type with listener configuration parameters which can't be provided as included-fields
    public static final String ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD = "LISTENER_PARAM_CONFIG_FIELD";
    public static final String ARG_TYPE_SERVICE_BASE_PATH = "SERVICE_BASE_PATH";
    public static final String ARG_TYPE_SERVICE_TYPE_DESCRIPTOR = "SERVICE_TYPE_DESCRIPTOR";
    public static final String ARG_TYPE_CDC_OPERATION_ENABLE = "CDC_OPERATION_ENABLE";

    public static final String CD_TYPE_PAYLOAD_TYPE = "PAYLOAD_TYPE";
    public static final String CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD = "PAYLOAD_TYPE_INCLUDED_RECORD";
    public static final String CD_TYPE_PAYLOAD_MODIFIER = "PAYLOAD_MODIFIER";
    public static final String CD_TYPE_ENUM_VALUE = "ENUM_VALUE";
    public static final String CD_TYPE_LISTENER_VAR_NAME = "LISTENER_VAR_NAME";
    public static final String CD_TYPE_EXISTING_LISTENER = "KEY_EXISTING_LISTENER";
    public static final String CD_TYPE_COMPLEX_FUNCTION_ANNOTATION = "COMPLEX_FUNCTION_ANNOTATION";
    public static final String CD_TYPE_MAPPING_CONSTRUCTOR = "MAPPING_CONSTRUCTOR";
    public static final String CD_TYPE_ENUM_LITERAL = "ENUM_LITERAL";
    public static final String CD_TYPE_FIELD_VALUE_CHOICE = "FIELD_VALUE_CHOICE";
    public static final String CD_TYPE_STRING_LITERAL = "STRING_LITERAL";
    public static final String FIELD_TYPE_VARIATION_SELECTOR = "VARIATION_SELECTOR";
    public static final String FIELD_TYPE_FLAG = "FLAG";
    public static final String KIND_VARIANT = "VARIANT";
    public static final String KIND_COMPLEX_REMOTE_FUNCTION = "COMPLEX_REMOTE_FUNCTION";
    public static final String KIND_COMPLEX_RESOURCE_FUNCTION = "COMPLEX_RESOURCE_FUNCTION";

    public static final String TYPE_SERVICE = "Service";

    public static final String CLASS_TYPE_SERVICE = "service";
    public static final String CLASS_TYPE_CLIENT = "client";
    public static final String CLASS_TYPE_DEFAULT = "default";

    public static final String TYPE_HTTP_SERVICE_CONFIG = "http:ServiceConfig";

    public static final String PROP_KEY_VARIABLE_NAME = "variableNameKey";
    public static final String PROP_KEY_LISTENER_TYPE = "listenerType";
    public static final String PROP_KEY_LISTENER = "listener";
    public static final String PROP_KEY_SERVICE_TYPE = "serviceType";
    public static final String PROP_KEY_BASE_PATH = "basePath";
    public static final String PROP_KEY_STRING_LITERAL = "stringLiteral";
    public static final String PROP_READONLY_METADATA_KEY = "readOnlyMetadata";
    public static final String PROP_KEY_DEFAULT_LISTENER = "defaultListener";
    public static final String DEFAULT_LISTENER_TYPE = "Listener";

    // protocol listeners
    public static final String HTTP_DEFAULT_LISTENER_EXPR = "http:getDefaultListener()";
    public static final String GRAPHQL_DEFAULT_LISTENER_EXPR = "new (listenTo = 8080)";
    public static final String TCP_DEFAULT_LISTENER_EXPR = "new (localPort = 8080)";

    // event listeners
    public static final String KAFKA_DEFAULT_LISTENER_EXPR = "new (bootstrapServers = \"\")";
    public static final String RABBITMQ_DEFAULT_LISTENER_EXPR = "new (host = \"localhost\", port = 5672)";
    public static final String MQTT_DEFAULT_LISTENER_EXPR = "new(\"tcp://localhost:1883\", \"listener-unique-id\", " +
            "\"mqtt/topic\")";
    public static final String ASB_DEFAULT_LISTENER_EXPR = "new (connectionString = \"\", " +
            "entityConfig = {queueName: \"test-queue\"}, autoComplete = false)";
    public static final String SF_DEFAULT_LISTENER_EXPR = "new (auth = {username: \"\", password: \"\"})";
    public static final String GITHUB_DEFAULT_LISTENER_EXPR = "new ()";

    public static final String HTTP_HEADER_PARAM_ANNOTATION = "Header";
    public static final String HTTP_QUERY_PARAM_ANNOTATION = "Query";
    public static final String HTTP_PAYLOAD_PARAM_ANNOTATION = "Payload";

    public static final String HTTP_PARAM_TYPE_PAYLOAD = "PAYLOAD";
    public static final String HTTP_PARAM_TYPE_HEADER = "HEADER";
    public static final String HTTP_PARAM_TYPE_QUERY = "QUERY";

    // file listeners
    public static final String FTP_DEFAULT_LISTENER_EXPR = "new ()";
    public static final String FILE_DEFAULT_LISTENER_EXPR = "new (path = \"\")";

    public static final MetaData SERCVICE_CLASS_NAME_METADATA = new MetaData("Class Name",
            "The name of the class definition");
    public static final MetaData GRAPHQL_CLASS_NAME_METADATA = new MetaData("Object Name",
            "The name of the object");
    public static final MetaData ARGUMENT_TYPE_METADATA = new MetaData("Argument Type",
            "The type of the argument");
    public static final MetaData ARGUMENT_NAME_METADATA = new MetaData("Argument Name",
            "The name of the argument");
    public static final MetaData ARGUMENT_DEFAULT_VALUE_METADATA = new MetaData("Default Value",
            "The default value of the argument");
    public static final MetaData ARGUMENT_DOCUMENTATION_METADATA = new MetaData("Description",
            "The description of the argument");
    public static final MetaData PARAMETER_TYPE_METADATA = new MetaData("Parameter Type",
            "The type of the parameter");
    public static final MetaData PARAMETER_NAME_METADATA = new MetaData("Parameter Name",
            "The name of the parameter");
    public static final MetaData PARAMETER_DEFAULT_VALUE_METADATA = new MetaData("Default Value",
            "The default value of the parameter");
    public static final MetaData PARAMETER_DOCUMENTATION_METADATA = new MetaData("Description",
            "The description of the parameter");
    public static final MetaData FIELD_TYPE_METADATA = new MetaData("Field Type",
            "The type of the field");
    public static final MetaData FIELD_NAME_METADATA = new MetaData("Field Name",
            "The name of the field");
    public static final MetaData FIELD_DOCUMENTAION_METADATA = new MetaData("Description",
            "The description of the field");
    public static final MetaData FIELD_DEFAULT_VALUE_METADATA = new MetaData("Initial Value",
            "The initial value of the filed");
    public static final MetaData FUNCTION_RETURN_TYPE_METADATA = new MetaData("Return Type",
            "The return type of the function");
    public static final MetaData FUNCTION_NAME_METADATA = new MetaData("Function Name",
            "The name of the function");
    public static final MetaData FUNCTION_ACCESSOR_METADATA = new MetaData("Accessor",
            "The accessor of the function");
    public static final MetaData RESOURCE_NAME_METADATA = new MetaData("Resource Path",
            "The resource path");
    public static final MetaData RESOURCE_FUNCTION_RETURN_TYPE_METADATA = new MetaData("Return Type",
            "The return type of the resource");
    public static final MetaData RESOURCE_FUNCTION_DOCUMENTATION_METADATA = new MetaData("Description",
            "The description of the resource");
    public static final MetaData SERVICE_DOCUMENTATION_METADATA = new MetaData("Description", "The " +
            "description of the class");
    public static final MetaData GRAPHQL_OBJECT_DOCUMENTATION_METADATA = new MetaData("Description",
            "The description of the object");

    // organization names
    public static final String BALLERINA = "ballerina";
    public static final String BALLERINAX = "ballerinax";

    // types
    public static final String USER_DEFINED_TYPE = "User-Defined";
    public static final String ERROR_TYPE = "Error Types";

    // annotation attachment points
    public static final String OBJECT_METHOD = "OBJECT_METHOD";

    public static final String DEFAULT = "default";
    public static final String RESOURCE_CONFIG = "ResourceConfig";
    public static final String ANNOT_PREFIX = "annot";

    // GraphQL advance params
    public static final String GRAPHQL_CONTEXT = "context";
    public static final String GRAPHQL_FIELD = "'field";

    // GraphQL function property keys
    public static final String GRAPHQL_CONTEXT_KEY = "paramContext";
    public static final String GRAPHQL_FIELD_KEY = "paramField";
    public static final String VALUE_FIELD = "value";

    // Type API contexts
    public static final String GRAPHQL_FIELD_TYPE = "GRAPHQL_FIELD_TYPE";
    public static final String GRAPHQL_INPUT_TYPE = "GRAPHQL_INPUT_TYPE";

    // GraphQL types
    public static final String GRAPHQL_SCALAR_TYPE = "Scalar Types";
    public static final String GRAPHQL_ENUM_TYPE = "Enum Types";

    // Data binding
    public static final String DATA_BINDING = "DATA_BINDING";
    public static final String DATA_BINDING_PROPERTY = "canDataBind";
    public static final String DATA_BINDING_TEMPLATE = "record {|*%s; %s %s;|}%s";
    public static final String EMPTY_ARRAY = "[]";
    public static final String PAYLOAD_FIELD_NAME_PROPERTY = "payloadFieldName";
    public static final String WRAPPER_TYPE_NAME_PROPERTY = "wrapperTypeName";

    public static final String TYPES_BAL = "types.bal";

    private Constants() {
    }
}
