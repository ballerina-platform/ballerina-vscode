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

import java.util.ArrayList;
import java.util.List;

/**
 * Represents a client class or connector with its methods.
 *
 * @since 1.7.0
 */
public class Client {
    private String name;
    private String description;
    private List<LibraryFunction> functions;
    @SerializedName("isDeprecated")
    private Boolean deprecated;
    private List<AnnotationAttachment> annotations;

    public Client(String name, String description) {
        this.name = name;
        this.description = description;
        this.functions = new ArrayList<>();
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

    public List<AnnotationAttachment> getAnnotations() {
        return annotations;
    }

    public void setAnnotations(List<AnnotationAttachment> annotations) {
        this.annotations = annotations;
    }
}
