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

package io.ballerina.flowmodelgenerator.core.model;

import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.tools.text.LineRange;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Represents the properties that uniquely identifies a node in the diagram.
 *
 * @param node               The kind of the component
 * @param org                The organization which the component belongs to
 * @param packageName        The package name of the component
 * @param module             The module which the component belongs to
 * @param object             The object of the component if it is a method or an action call
 * @param symbol             The symbol of the component
 * @param version            The version of the component
 * @param lineRange          The line range of the component
 * @param sourceCode         The source code of the component
 * @param parentSymbol       The parent symbol of the component
 * @param resourcePath       The path of the resource function
 * @param id                 The unique identifier of the component if exists
 * @param isNew              Whether the component is a node template
 * @param isGenerated        The component is auto generated or not
 * @param inferredReturnType The inferred return type of the component if exists
 * @param data               The additional data
 * @since 1.0.0
 */
public record Codedata(NodeKind node, String org, String module, String packageName, String object, String symbol,
                       String version, LineRange lineRange, String sourceCode, String parentSymbol,
                       String resourcePath, Integer id, Boolean isNew, Boolean isGenerated,
                       String inferredReturnType, Map<String, Object> data) {

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder(node.toString());
        String[] fields = {org, module, object, symbol};

        for (String field : fields) {
            if (field != null) {
                sb.append(":").append(field);
            }
        }
        return sb.toString();
    }

    public String getImportSignature() {
        return org + "/" + module;
    }

    public String getModuleId() {
        return org + "/" + module + ":" + version;
    }

    public String getModulePrefix() {
        return module.substring(module.lastIndexOf('.') + 1);
    }

    public static class Builder<T> extends FacetedBuilder<T> {

        private NodeKind node;
        private String org;
        private String module;
        private String packageName;
        private String object;
        private String symbol;
        private String version;
        private LineRange lineRange;
        private String sourceCode;
        private String parentSymbol;
        private String resourcePath;
        private Integer id;
        private Boolean isNew;
        private Boolean isGenerated;
        private String inferredReturnType;
        private Map<String, Object> data;

        public Builder(T parentBuilder) {
            super(parentBuilder);
        }

        public Builder<T> node(NodeKind node) {
            this.node = node;
            return this;
        }

        public NodeKind node() {
            return node;
        }

        public Builder<T> org(String org) {
            this.org = org;
            return this;
        }

        public Builder<T> module(String module) {
            this.module = module;
            return this;
        }

        public Builder<T> packageName(String packageName) {
            this.packageName = packageName;
            return this;
        }

        public Builder<T> object(String object) {
            this.object = object;
            return this;
        }

        public Builder<T> symbol(String symbol) {
            this.symbol = symbol;
            return this;
        }

        public Builder<T> version(String version) {
            this.version = version;
            return this;
        }

        public Builder<T> nodeInfo(Node node) {
            this.lineRange = node.lineRange();
            this.sourceCode = node.toSourceCode().strip();
            return this;
        }

        public Builder<T> lineRange(LineRange lineRange) {
            this.lineRange = lineRange;
            return this;
        }

        public Builder<T> sourceCode(String sourceCode) {
            this.sourceCode = sourceCode;
            return this;
        }

        public Builder<T> parentSymbol(String parentSymbol) {
            this.parentSymbol = parentSymbol;
            return this;
        }

        public Builder<T> resourcePath(String resourcePath) {
            this.resourcePath = resourcePath;
            return this;
        }

        public Builder<T> id(int id) {
            this.id = id;
            return this;
        }

        public Builder<T> isNew() {
            this.isNew = true;
            return this;
        }

        public Builder<T> isNew(boolean isNew) {
            this.isNew = isNew;
            return this;
        }

        public Builder<T> isGenerated(Boolean isGenerated) {
            this.isGenerated = isGenerated;
            return this;
        }

        public Builder<T> inferredReturnType(String inferredReturnType) {
            this.inferredReturnType = inferredReturnType;
            return this;
        }

        public Builder<T> data(String key, Object value) {
            if (data == null) {
                data = new LinkedHashMap<>();
            }
            data.put(key, value);
            return this;
        }

        public Builder<T> data(Map<String, Object> data) {
            this.data = data;
            return this;
        }

        /**
         * Populates all fields of this builder from the given {@code source} {@link Codedata}, effectively
         * cloning it into the builder so that individual fields can be overridden before calling
         * {@link #stepOut()}.
         *
         * @param source the {@link Codedata} to copy field values from; must not be {@code null}
         * @return this builder for fluent chaining
         */
        public Builder<T> from(Codedata source) {
            this.node = source.node();
            this.org = source.org();
            this.module = source.module();
            this.packageName = source.packageName();
            this.object = source.object();
            this.symbol = source.symbol();
            this.version = source.version();
            this.lineRange = source.lineRange();
            this.sourceCode = source.sourceCode();
            this.parentSymbol = source.parentSymbol();
            this.resourcePath = source.resourcePath();
            this.id = Objects.requireNonNullElse(source.id(), 0);
            this.isNew = source.isNew() != null && source.isNew();
            this.isGenerated = source.isGenerated();
            this.inferredReturnType = source.inferredReturnType();
            this.data = source.data() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(source.data());
            return this;
        }

        public Builder<T> addData(String key, Object value) {
            if (data == null) {
                data = new LinkedHashMap<>();
            }
            data.put(key, value);
            return this;
        }

        public Codedata build() {
            return new Codedata(node, org, module, packageName, object, symbol, version, lineRange, sourceCode,
                    parentSymbol, resourcePath, id, isNew, isGenerated, inferredReturnType, data);
        }
    }
}
