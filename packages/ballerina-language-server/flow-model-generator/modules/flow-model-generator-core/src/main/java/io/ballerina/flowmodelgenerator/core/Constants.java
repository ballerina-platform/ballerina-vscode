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

package io.ballerina.flowmodelgenerator.core;

import java.util.List;

/**
 * Constants used in the flow model generator.
 *
 * @since 1.0.0
 */
public class Constants {

    // Check keywords
    public static final String CHECK = "check";
    public static final String CHECKPANIC = "checkpanic";

    public static final String MAIN_FUNCTION_NAME = "main";
    public static final String BALLERINA = "ballerina";
    public static final String BALLERINAX = "ballerinax";

    // AI related constants
    public static final String AI = "ai";
    public static final String DEFAULT_MODEL_PROVIDER = "getDefaultModelProvider";

    public static final String CONDITION_TYPE_CONSTRAINT = "boolean";
    public static final String MATCH_TARGET_TYPE_CONSTRAINT = "any|error";
    public static final String COLLECTION_TYPE_CONSTRAINT =
            "(any|error)[]|stream<any|error, ()>|string|map<any|error>|json";

    // Codedata data keys
    public static final String FILE_PATH_KEY = "filePath";

    // Constants used for Natural functions
    public static final class NaturalFunctions {

        private NaturalFunctions() {
        }

        public static final String MODEL_PROVIDER = "modelProvider";
        public static final String MODEL_PROVIDER_LABEL = "Configure the model";
        public static final String MODEL_PROVIDER_DESCRIPTION = "The large language model (LLM) to use";

        // Model selection choices
        public static final String DEFAULT_MODEL_PROVIDER_WSO2 = "Default Model Provider (WSO2)";
        public static final String ACCEPT_AS_PARAMETER = "Accept as a parameter";

        public static final String MODEL_PROVIDER_AS_PARAMETER_KEY = "modelProviderAsParameter";

        public static final String PROMPT = "prompt";
        public static final String MODULE_PREFIXED_PROMPT_TYPE = "np:Prompt";
        public static final String PROMPT_LABEL = "Prompt";
        public static final String PROMPT_DESCRIPTION = "Prompt for the function";

        public static final String MODEL = "model";
        public static final String MODEL_TYPE_NAME = "ModelProvider";
        public static final String MODULE_PREFIXED_MODEL_PROVIDER_TYPE = "ai:ModelProvider";
        public static final String MODEL_LABEL = "Model";
        public static final String MODEL_DESCRIPTION = "Model for the function";

        public static final List<String> MODEL_PROVIDER_OPTIONS = List.of(
                NaturalFunctions.DEFAULT_MODEL_PROVIDER_WSO2,
                NaturalFunctions.ACCEPT_AS_PARAMETER
        );

        public static final String ENABLE_MODEL_CONTEXT = "enableModelContext";
        public static final String ENABLE_MODEL_CONTEXT_LABEL = "Enable model configuration";
        public static final String ENABLE_MODEL_CONTEXT_DESCRIPTION =
                "Allow specifying Large Language Model (LLM) choice";

        public static final String BALLERINAX_ORG = "ballerinax";
        public static final String BALLERINA_ORG = "ballerina";
        public static final String NP_PACKAGE = "np";
        public static final String AI_PACKAGE = "ai";
        public static final String NP_PACKAGE_WITH_ORG = BALLERINAX_ORG + "/" + NP_PACKAGE;

        public static final String ICON =
                "https://gist.github.com/user-attachments/assets/903c5c16-7d67-4af8-8113-ce7c59ccdaab";

    }

    // Constants used for Workflow
    public static final class Workflow {

        private Workflow() {
        }

        public static final String WORKFLOW_ORG = "ballerina";
        public static final String WORKFLOW_MODULE = "workflow";
        public static final String ACTIVITY_MODULE = "workflow.activity";
        public static final String CONTEXT_CLASS_NAME = "Context";
        public static final String RUN_METHOD_NAME = "run";
        public static final String RUN_PROCESS_FUNCTION_PARAM = "processFunction";
        public static final String RUN_LABEL = "Run Workflow";
        public static final String RUN_DESCRIPTION = "Run a new workflow instance";
        public static final String SEND_DATA_METHOD_NAME = "sendData";
        public static final String SEND_DATA_LABEL = "Send Data Event";
        public static final String SEND_DATA_DESCRIPTION = "Send a data event to a running workflow instance";
        public static final String CALL_ACTIVITY_METHOD_NAME = "callActivity";
        public static final String AWAIT_METHOD_NAME = "await";
        public static final String CALL_ACTIVITY_LABEL = "Call Activity";
        public static final String CALL_ACTIVITY_DESCRIPTION = "Call a workflow activity function";
        public static final String WAIT_DATA_LABEL = "Await Data Event";
        public static final String WAIT_DATA_DESCRIPTION = "Wait for a data event from outside the workflow";

        // Child workflow composition (Context remote methods)
        public static final String RUN_CHILD_WORKFLOW_METHOD_NAME = "runChildWorkflow";
        public static final String RUN_CHILD_WORKFLOW_LABEL = "Run Child Workflow";
        public static final String RUN_CHILD_WORKFLOW_DESCRIPTION =
                "Start a child workflow and continue without waiting for its result";
        public static final String CALL_CHILD_WORKFLOW_METHOD_NAME = "callWorkflow";
        public static final String CALL_CHILD_WORKFLOW_LABEL = "Call Child Workflow";
        public static final String CALL_CHILD_WORKFLOW_DESCRIPTION =
                "Run a child workflow and durably wait for its result";
        public static final String WAIT_CHILD_WORKFLOW_METHOD_NAME = "waitForChildWorkflow";
        public static final String WAIT_CHILD_WORKFLOW_LABEL = "Wait for Child Workflow";
        public static final String WAIT_CHILD_WORKFLOW_DESCRIPTION =
                "Durably wait for a started child workflow's result";
        public static final String SEND_DATA_CHILD_WORKFLOW_METHOD_NAME = "sendDataToChildWorkflow";
        public static final String SEND_DATA_CHILD_WORKFLOW_LABEL = "Send Data to Child Workflow";
        public static final String SEND_DATA_CHILD_WORKFLOW_DESCRIPTION =
                "Send a data event to a running child workflow";

        // Workflow context utility functions
        public static final String CURRENT_TIME_METHOD_NAME = "currentTime";
        public static final String CURRENT_TIME_LABEL = "Current Time";
        public static final String CURRENT_TIME_DESCRIPTION =
                "Deterministic current time, safe to use inside workflow logic";
        public static final String IS_REPLAYING_METHOD_NAME = "isReplaying";
        public static final String IS_REPLAYING_LABEL = "Is Replaying";
        public static final String IS_REPLAYING_DESCRIPTION =
                "Whether the workflow is currently replaying recorded history";
        public static final String GET_WORKFLOW_ID_METHOD_NAME = "getWorkflowId";
        public static final String GET_WORKFLOW_ID_LABEL = "Get Workflow ID";
        public static final String GET_WORKFLOW_ID_DESCRIPTION = "The unique ID of this workflow instance";
        public static final String GET_WORKFLOW_TYPE_METHOD_NAME = "getWorkflowType";
        public static final String GET_WORKFLOW_TYPE_LABEL = "Get Workflow Type";
        public static final String GET_WORKFLOW_TYPE_DESCRIPTION = "The type name of this workflow";
        public static final String WORKFLOW = "Workflow";
        public static final String ACTIVITY = "Activity";
        public static final String DEFAULT_CTX_PARAM_NAME = "ctx";
        public static final String DEFAULT_DATA_PARAM_NAME = "data";
        public static final String DEFAULT_INPUT_PARAM_NAME = "input";
        public static final String DATA_SUFFIX = "Data";
        public static final String ANYDATA = "anydata";

        // Builtin activity constants
        public static final String BUILTIN_REST_LABEL = "Call REST API";
        public static final String BUILTIN_REST_DESCRIPTION = "Call a REST API endpoint";
        public static final String BUILTIN_REST_FUNCTION = "callRestAPI";
        public static final String BUILTIN_SOAP_LABEL = "Call SOAP API";
        public static final String BUILTIN_SOAP_DESCRIPTION = "Call a SOAP web service";
        public static final String BUILTIN_SOAP_FUNCTION = "callSoapAPI";
        public static final String BUILTIN_EMAIL_LABEL = "Send Email (SMTP)";
        public static final String BUILTIN_EMAIL_DESCRIPTION = "Send an email via SMTP";
        public static final String BUILTIN_EMAIL_FUNCTION = "sendEmail";

        public static final String CALL_HUMAN_TASK_METHOD_NAME = "awaitHumanTask";
        public static final String HUMAN_TASK_LABEL = "Await Human Task";
        public static final String HUMAN_TASK_DESCRIPTION = "Create a human task and wait for a human to complete it";

        public static final String SLEEP_METHOD_NAME = "sleep";
        public static final String SLEEP_LABEL = "Sleep";
        public static final String SLEEP_DESCRIPTION = "Pause workflow execution for a specified duration";

        // Durable agent constants
        public static final String DURABLE_AGENT = "DurableAgenticWorkflow";
        public static final String DURABLE_AGENT_OBJECT_CLASS_NAME = "DurableAgent";
        public static final String AGENT_OBJECT_RUN_METHOD_NAME = "run";
        public static final String AGENT_CONTEXT_CLASS_NAME = "AgenticWorkflowContext";
        public static final String REGISTER_ACTIVITY_METHOD_NAME = "registerActivity";
        public static final String REGISTER_ACTIVITY_LABEL = "Register Activity";
        public static final String REGISTER_ACTIVITY_DESCRIPTION =
                "Register a workflow activity as a durable agent tool";
        public static final String REGISTER_HUMAN_TASK_METHOD_NAME = "registerHumanTask";
        public static final String REGISTER_HUMAN_TASK_LABEL = "Register HumanTask";
        public static final String REGISTER_HUMAN_TASK_DESCRIPTION =
                "Register a human task the agent can create and wait on";
        public static final String REGISTER_UPDATE_EVENTS_METHOD_NAME = "registerUpdateEvents";
        public static final String REGISTER_EVENT_LABEL = "Register Data Event";
        public static final String REGISTER_EVENT_DESCRIPTION =
                "Declare a named data-event channel the agent can wait on; a response type makes it "
                        + "request-response";
        public static final String REGISTER_AGENT_TOOL_METHOD_NAME = "registerAgentTool";
        public static final String REGISTER_AGENT_TOOL_LABEL = "Register AgentTool";
        public static final String REGISTER_AGENT_TOOL_DESCRIPTION =
                "Register an AI tool the agent can invoke";
        public static final String RUN_DURABLE_AGENT_METHOD_NAME = "buildAndRunAgent";
        public static final String RUN_DURABLE_AGENT_LABEL = "Configure Agent";
        public static final String RUN_DURABLE_AGENT_DESCRIPTION =
                "Configure the agent's role, instructions, model and reasoning limit";
        public static final String RUN_DURABLE_AGENT_FUNCTION_NAME = "runDurableAgent";
        public static final String AGENT_SEND_DATA_METHOD_NAME = "sendData";
        public static final String AGENT_WAIT_DATA_RESULT_METHOD_NAME = "waitForDataResult";
        public static final String AGENT_SEND_DATA_LABEL = "Send Agent Data Event";
        public static final String AGENT_SEND_DATA_DESCRIPTION =
                "Send a data event to a running durable agent and read its answer for that turn";
        public static final String AGENT_START_METHOD_NAME = "run";
        public static final String AGENT_START_LABEL = "Run Durable Agent";
        public static final String AGENT_START_DESCRIPTION =
                "Start a durable agent instance and bind its instance ID";
        public static final String AGENT_GET_RESULT_METHOD_NAME = "getResult";
        public static final String AGENT_WAIT_RESULT_METHOD_NAME = "waitForResult";
        public static final String AGENT_RESULT_LABEL = "Get Agent Result";
        public static final String AGENT_RESULT_DESCRIPTION =
                "Read a durable agent instance's final result";
        public static final String AGENT_GET_DATA_RESULT_METHOD_NAME = "getDataResult";
        public static final String AGENT_DATA_RESULT_LABEL = "Get Data Event Result";
        public static final String AGENT_DATA_RESULT_DESCRIPTION =
                "Read the agent's answer for a sent data event by its correlation token";
        // Titles for the waiting variants, which suspend the caller until the agent answers.
        // The diagram renders these with the wait affordance; the data-event wait names the
        // channel it is waiting on, resolved from the sendData call that issued the token.
        public static final String AGENT_WAIT_RESULT_LABEL = "Wait for Result";
        public static final String AGENT_WAIT_DATA_RESULT_LABEL = "Wait for Data Event Result";
    }

    // Constants used for AI
    public static final class Ai {

        private Ai() {
        }

        public static final String BALLERINA_ORG = "ballerina";
        public static final String AI_PACKAGE = "ai";
        public static final String MCP_PACKAGE = "mcp";
        public static final String LOG_PACKAGE = "log";
        public static final String HTTP_PACKAGE = "http";

        public static final String RECURSIVE_DOCUMENT_CHUNKER_LABEL = "Recursive Document Chunker";
        public static final String AUGMENT_QUERY_LABEL = "Augment Query";

        public static final String KNOWLEDGE_BASE_TYPE_NAME = "KnowledgeBase";
        public static final String AGENT_TYPE_NAME = "Agent";

        public static final String AGENT_RUN_METHOD_NAME = "run";
        public static final String AGENT_TRACE_METHOD_NAME = "trace";
        public static final String AGENT_SYMBOL_NAME = "init";
        public static final String CHUNK_DOCUMENT_RECURSIVELY_METHOD_NAME = "chunkDocumentRecursively";
        public static final String AUGMENT_USER_QUERY_METHOD_NAME = "augmentUserQuery";

        public static final String MODEL_PROVIDER_TYPE_NAME = "ModelProvider";
        public static final String EMBEDDING_PROVIDER_TYPE_NAME = "EmbeddingProvider";
        public static final String VECTOR_STORE_TYPE_NAME = "VectorStore";
        public static final String CHUNKER_TYPE_NAME = "Chunker";
        public static final String DATA_LOADER_TYPE_NAME = "DataLoader";
        public static final String SHORT_TERM_MEMORY_STORE_TYPE_NAME = "ShortTermMemoryStore";
        public static final String WSO2_MODEL_PROVIDER_NAME = "Wso2ModelProvider";
        public static final String WSO2_EMBEDDING_PROVIDER_NAME = "Wso2EmbeddingProvider";
        public static final String GET_DEFAULT_MODEL_PROVIDER_METHOD = "getDefaultModelProvider";
        public static final String GET_DEFAULT_EMBEDDING_PROVIDER_METHOD = "getDefaultEmbeddingProvider";
        public static final String OPEN_AI_PROVIDER = "OpenAiProvider";

        public static final String AGENT_CODEDATA = "agentCodedata";
    }
}
