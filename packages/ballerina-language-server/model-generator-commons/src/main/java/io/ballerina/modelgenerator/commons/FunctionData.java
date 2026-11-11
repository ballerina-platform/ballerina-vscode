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

package io.ballerina.modelgenerator.commons;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Represents the result of a function.
 *
 * @since 1.0.0
 */
public class FunctionData {

    private final int functionId;
    private final String name;
    private final String description;
    private final String returnType;
    private final String packageName;
    private final String moduleName;
    private final String org;
    private final String version;
    private final String resourcePath;
    private final Kind kind;
    private final boolean returnError;
    private final boolean inferredReturnType;
    private final String importStatements;
    private boolean agentToolCompatible;
    private boolean deprecated;
    private Map<String, ParameterData> parameters;
    private String packageId;
    private ReturnTypeData returnTypeData;

    public FunctionData(int functionId, String name, String description, String returnType,
                        String packageName, String moduleName, String org, String version, String resourcePath,
                        Kind kind, boolean returnError, boolean inferredReturnType, String importStatements) {
        this.functionId = functionId;
        this.name = name;
        this.description = description;
        this.returnType = returnType;
        this.packageName = packageName;
        this.moduleName = moduleName;
        this.org = org;
        this.version = version;
        this.resourcePath = resourcePath;
        this.kind = kind;
        this.returnError = returnError;
        this.inferredReturnType = inferredReturnType;
        this.importStatements = importStatements;
    }

    public void setParameters(Map<String, ParameterData> parameters) {
        this.parameters = parameters;
    }

    public void setPackageId(String attachmentId) {
        this.packageId = attachmentId;
    }

    public void setReturnTypeData(ReturnTypeData returnTypeData) {
        this.returnTypeData = returnTypeData;
    }

    public void setAgentToolCompatible(boolean agentToolCompatible) {
        this.agentToolCompatible = agentToolCompatible;
    }

    // Getters
    public int functionId() {
        return functionId;
    }

    public String name() {
        return name;
    }

    public String description() {
        return description;
    }

    public String returnType() {
        return returnType;
    }

    public String packageName() {
        return packageName;
    }

    public String moduleName() {
        return moduleName;
    }

    public String org() {
        return org;
    }

    public String version() {
        return version;
    }

    public String resourcePath() {
        return resourcePath;
    }

    public Kind kind() {
        return kind;
    }

    public boolean returnError() {
        return returnError;
    }

    public boolean inferredReturnType() {
        return inferredReturnType;
    }

    public String importStatements() {
        return importStatements;
    }

    public Map<String, ParameterData> parameters() {
        return parameters;
    }

    public String packageId() {
        return packageId;
    }

    public ReturnTypeData returnTypeData() {
        return returnTypeData;
    }

    public void setDeprecated(boolean deprecated) {
        this.deprecated = deprecated;
    }

    public boolean deprecated() {
        return deprecated;
    }

    public boolean agentToolCompatible() {
        return agentToolCompatible;
    }
    
    public enum Kind {
        FUNCTION,
        CONNECTOR,
        MODEL_PROVIDER,
        MEMORY,
        SHORT_TERM_MEMORY_STORE,
        EMBEDDING_PROVIDER,
        VECTOR_STORE,
        KNOWLEDGE_BASE,
        DATA_LOADER,
        CHUNKER,
        MCP_TOOL_KIT,
        REMOTE,
        RESOURCE,
        LISTENER_INIT,
        CLASS_INIT,
        ACTIVITY,
        WAIT_DATA;

        private static final Set<Kind> AI_CLASS_KINDS = EnumSet.of(
                FunctionData.Kind.MODEL_PROVIDER,
                FunctionData.Kind.MEMORY,
                FunctionData.Kind.SHORT_TERM_MEMORY_STORE,
                FunctionData.Kind.EMBEDDING_PROVIDER,
                FunctionData.Kind.VECTOR_STORE,
                FunctionData.Kind.DATA_LOADER,
                FunctionData.Kind.CHUNKER,
                FunctionData.Kind.KNOWLEDGE_BASE,
                FunctionData.Kind.MCP_TOOL_KIT
        );

        public static boolean isAiClassKind(Kind kind) {
            return AI_CLASS_KINDS.contains(kind);
        }

        public static boolean isConnector(Kind kind) {
            return kind == CONNECTOR;
        }

        public static boolean isListener(Kind kind) {
            return kind == LISTENER_INIT;
        }
    }
}
