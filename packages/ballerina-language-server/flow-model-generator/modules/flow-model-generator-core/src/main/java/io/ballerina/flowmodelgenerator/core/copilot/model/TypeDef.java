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

package io.ballerina.flowmodelgenerator.core.copilot.model;

import com.google.gson.annotations.SerializedName;

import java.util.List;

/**
 * Represents a type definition (record, enum, union, class, constant, etc.).
 *
 * @since 1.7.0
 */
public class TypeDef {
    private String name;
    private String description;
    private String type;
    private List<Field> fields;
    private List<TypeDefMember> members;
    private List<LibraryFunction> functions;
    private String value;
    private Type varType;
    // The compiler's own signature for the type, carried only for definitions that have no members
    // to model (error types, tuples, maps, tables, streams, intersections). For every other category
    // the members ARE the shape, and this stays null.
    private String baseType;
    // Set for an object type carrying the `client` qualifier (e.g. sql:Client), so it renders as
    // `client class` rather than a plain `class`. Class definitions with the qualifier never reach
    // here — they are emitted as clients instead.
    @SerializedName("isClient")
    private Boolean client;
    @SerializedName("isDeprecated")
    private Boolean deprecated;
    private List<AnnotationAttachment> annotations;

    public TypeDef() {
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public Type getVarType() {
        return varType;
    }

    public void setVarType(Type varType) {
        this.varType = varType;
    }

    public List<Field> getFields() {
        return fields;
    }

    public void setFields(List<Field> fields) {
        this.fields = fields;
    }

    public List<TypeDefMember> getMembers() {
        return members;
    }

    public void setMembers(List<TypeDefMember> members) {
        this.members = members;
    }

    public List<LibraryFunction> getFunctions() {
        return functions;
    }

    public void setFunctions(List<LibraryFunction> functions) {
        this.functions = functions;
    }

    public Boolean isDeprecated() {
        return deprecated;
    }

    public void setDeprecated(Boolean deprecated) {
        this.deprecated = deprecated;
    }

    public Boolean getClient() {
        return client;
    }

    public void setClient(Boolean client) {
        this.client = client;
    }

    public String getBaseType() {
        return baseType;
    }

    public void setBaseType(String baseType) {
        this.baseType = baseType;
    }

    public List<AnnotationAttachment> getAnnotations() {
        return annotations;
    }

    public void setAnnotations(List<AnnotationAttachment> annotations) {
        this.annotations = annotations;
    }
}
