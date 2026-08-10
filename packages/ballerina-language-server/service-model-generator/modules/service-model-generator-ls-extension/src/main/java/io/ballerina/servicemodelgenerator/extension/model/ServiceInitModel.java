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

package io.ballerina.servicemodelgenerator.extension.model;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_TYPE_DESCRIPTOR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROPERTY_BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TYPE_SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getValueString;

/**
 * Represents a model unifying service initialization and listener creation.
 *
 * @since 1.3.0
 */
public class ServiceInitModel {
    public static final String KEY_LISTENER_VAR_NAME = "listenerVarName";
    public static final String KEY_CONFIGURE_LISTENER = "configureListener";
    public static final String KEY_EXISTING_LISTENER = "existingListener";
    public static final String KEY_LISTENER_SELECTION = "listenerSelection";

    private final String id;
    private final String displayName;
    private final String description;
    private final String orgName;
    private final String packageName;
    private final String moduleName;
    private final String version;
    private final String type;
    private final String icon;
    private final Map<String, Value> properties = new LinkedHashMap<>();
    private Boolean isLocalRepository;

    public ServiceInitModel(String id, String displayName, String description, String orgName,
                            String packageName, String moduleName, String version, String type, String icon) {
        this.id = id;
        this.displayName = displayName;
        this.description = description;
        this.orgName = orgName;
        this.packageName = packageName;
        this.moduleName = moduleName;
        this.version = version;
        this.type = type;
        this.icon = icon;
    }

    public String getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getDescription() {
        return description;
    }

    public String getOrgName() {
        return orgName;
    }

    public String getPackageName() {
        return packageName;
    }

    public String getModuleName() {
        return moduleName;
    }

    public String getVersion() {
        return version;
    }

    public String getType() {
        return type;
    }

    public String getIcon() {
        return icon;
    }

    public Map<String, Value> getProperties() {
        return properties;
    }

    public boolean isLocalRepository() {
        return Boolean.TRUE.equals(isLocalRepository);
    }

    public void setLocalRepository(boolean isLocalRepository) {
        this.isLocalRepository = isLocalRepository;
    }

    public void addProperty(String key, Value value) {
        this.properties.put(key, value);
    }

    public void addProperties(Map<String, Value> properties) {
        if (Objects.isNull(properties)) {
            return;
        }
        this.properties.putAll(properties);
    }

    public String getServiceTypeName() {
        Value basePath = properties.get(PROPERTY_BASE_PATH);
        if (basePath == null) {
            return TYPE_SERVICE;
        }
        Object value = basePath.getValue();
        Codedata codedata = basePath.getCodedata();
        if (value == null || codedata == null) {
            return TYPE_SERVICE;
        }
        return ARG_TYPE_SERVICE_TYPE_DESCRIPTOR.equals(codedata.getArgType()) ? value.toString() : TYPE_SERVICE;
    }

    public String getBasePath(String listenerProtocol) {
        StringBuilder builder = new StringBuilder();
        Value basePath = properties.get(PROPERTY_BASE_PATH);
        if (basePath != null && !basePath.getValue().isEmpty()) {
            if (basePath.getCodedata().getArgType().equals(ARG_TYPE_SERVICE_TYPE_DESCRIPTOR)) {
                builder.append(listenerProtocol).append(COLON);
            }
            builder.append(basePath.getValue());
        } else {
            builder.append(listenerProtocol).append(COLON).append(TYPE_SERVICE);
        }
        return builder.toString();
    }

    public Value getDesignApproach() {
        return properties.get("designApproach");
    }

    public Value getListener() {
        return properties.get("listener");
    }

    public Value getOpenAPISpec() {
        return properties.get("spec");
    }

    public Value getGraphqlSchema() {
        return properties.get("spec");
    }

    public String getServiceContractTypeName() {
        Value serviceContractType = properties.get("serviceTypeName");
        if (Objects.isNull(serviceContractType)) {
            return TYPE_SERVICE;
        }
        return getValueString(serviceContractType);
    }

    public static class Builder {
        private String id;
        private String displayName;
        private String description;
        private String orgName;
        private String packageName;
        private String moduleName;
        private String version;
        private String type;
        private String icon;

        public Builder setId(String id) {
            this.id = id;
            return this;
        }

        public Builder setDisplayName(String displayName) {
            this.displayName = displayName;
            return this;
        }

        public Builder setDescription(String description) {
            this.description = description;
            return this;
        }

        public Builder setOrgName(String orgName) {
            this.orgName = orgName;
            return this;
        }

        public Builder setPackageName(String packageName) {
            this.packageName = packageName;
            return this;
        }

        public Builder setModuleName(String moduleName) {
            this.moduleName = moduleName;
            return this;
        }

        public Builder setVersion(String version) {
            this.version = version;
            return this;
        }

        public Builder setType(String type) {
            this.type = type;
            return this;
        }

        public Builder setIcon(String icon) {
            this.icon = icon;
            return this;
        }

        public ServiceInitModel build() {
            return new ServiceInitModel(id, displayName, description, orgName, packageName,
                    moduleName, version, type, icon);
        }
    }
}
