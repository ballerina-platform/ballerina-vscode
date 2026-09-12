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

import io.ballerina.tools.text.LineRange;

/**
 * Represents a model to capture data related to code elements.
 *
 * @since 1.0.0
 */
public class Codedata {
    private LineRange lineRange;
    private String type;
    private String argType;
    private String originalName;
    private String orgName;
    private String packageName;
    private String moduleName;
    private String version;
    private Integer position;
    private String path;
    private String valueQualifier;
    private String template;
    private String defaultType;
    private String boundType;
    private Boolean bindable;
    private String modifier;
    private String targetParam;
    private String field;
    private String typeIdentifier;
    private Boolean optional;
    private String value;
    private Boolean nameEditable;
    private Boolean preserveValue;
    private String castType;
    private DriverDependency driverDependency;

    public Codedata() {
    }

    public Codedata(String type) {
        this.type = type;
    }

    public Codedata(String type, String argType) {
        this.type = type;
        this.argType = argType;
    }

    public Codedata(LineRange lineRange) {
        this(lineRange, false, false, false);
    }

    public Codedata(LineRange lineRange, boolean inListenerInit, boolean isBasePath, boolean inDisplayAnnotation) {
        this.lineRange = lineRange;
    }

    public Codedata(LineRange lineRange, String moduleName, String orgName) {
        this.lineRange = lineRange;
        this.moduleName = moduleName;
        this.orgName = orgName;
    }

    public LineRange getLineRange() {
        return lineRange;
    }

    public void setLineRange(LineRange lineRange) {
        this.lineRange = lineRange;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getArgType() {
        return argType;
    }

    public void setArgType(String argType) {
        this.argType = argType;
    }

    public String getOriginalName() {
        return originalName;
    }

    public void setOriginalName(String originalName) {
        this.originalName = originalName;
    }

    public String getOrgName() {
        return orgName;
    }

    public void setOrgName(String orgName) {
        this.orgName = orgName;
    }

    public String getPackageName() {
        return packageName;
    }

    public void setPackageName(String packageName) {
        this.packageName = packageName;
    }

    public String getModuleName() {
        return moduleName;
    }

    public void setModuleName(String moduleName) {
        this.moduleName = moduleName;
    }

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
    }

    public Integer getPosition() {
        return position;
    }

    public void setPosition(Integer position) {
        this.position = position;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public String getValueQualifier() {
        return valueQualifier;
    }

    public void setValueQualifier(String valueQualifier) {
        this.valueQualifier = valueQualifier;
    }

    public String getTemplate() {
        return template;
    }

    public void setTemplate(String template) {
        this.template = template;
    }

    public String getDefaultType() {
        return defaultType;
    }

    public void setDefaultType(String defaultType) {
        this.defaultType = defaultType;
    }

    public String getBoundType() {
        return boundType;
    }

    public void setBoundType(String boundType) {
        this.boundType = boundType;
    }

    public Boolean getBindable() {
        return bindable;
    }

    public void setBindable(Boolean bindable) {
        this.bindable = bindable;
    }

    public String getModifier() {
        return modifier;
    }

    public void setModifier(String modifier) {
        this.modifier = modifier;
    }

    public String getTargetParam() {
        return targetParam;
    }

    public void setTargetParam(String targetParam) {
        this.targetParam = targetParam;
    }

    public String getField() {
        return field;
    }

    public void setField(String field) {
        this.field = field;
    }

    public String getTypeIdentifier() {
        return typeIdentifier;
    }

    public void setTypeIdentifier(String typeIdentifier) {
        this.typeIdentifier = typeIdentifier;
    }

    public Boolean getOptional() {
        return optional;
    }

    public void setOptional(Boolean optional) {
        this.optional = optional;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public Boolean getNameEditable() {
        return nameEditable;
    }

    public void setNameEditable(Boolean nameEditable) {
        this.nameEditable = nameEditable;
    }

    public Boolean getPreserveValue() {
        return preserveValue;
    }

    public void setPreserveValue(Boolean preserveValue) {
        this.preserveValue = preserveValue;
    }

    public String getCastType() {
        return castType;
    }

    public void setCastType(String castType) {
        this.castType = castType;
    }

    public DriverDependency getDriverDependency() {
        return driverDependency;
    }

    public void setDriverDependency(DriverDependency driverDependency) {
        this.driverDependency = driverDependency;
    }

    public static class Builder {
        private LineRange lineRange;
        private String type;
        private String argType;
        private String originalName;
        private String orgName;
        private String packageName;
        private String moduleName;
        private String version;
        private Integer position;
        private String path;
        private String valueQualifier;

        public Builder() {
        }

        public Builder setLineRange(LineRange lineRange) {
            this.lineRange = lineRange;
            return this;
        }

        public Builder setType(String type) {
            this.type = type;
            return this;
        }

        public Builder setArgType(String argType) {
            this.argType = argType;
            return this;
        }

        public Builder setOriginalName(String originalName) {
            this.originalName = originalName;
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

        public Builder setPosition(Integer position) {
            this.position = position;
            return this;
        }

        public Builder setPath(String path) {
            this.path = path;
            return this;
        }

        public Builder setValueQualifier(String valueQualifier) {
            this.valueQualifier = valueQualifier;
            return this;
        }

        public Codedata build() {
            Codedata codedata = new Codedata();
            codedata.setLineRange(lineRange);
            codedata.setType(type);
            codedata.setArgType(argType);
            codedata.setOriginalName(originalName);
            codedata.setOrgName(orgName);
            codedata.setPackageName(packageName);
            codedata.setModuleName(moduleName);
            codedata.setVersion(version);
            codedata.setPosition(position);
            codedata.setPath(path);
            codedata.setValueQualifier(valueQualifier);
            return codedata;
        }
    }
}
