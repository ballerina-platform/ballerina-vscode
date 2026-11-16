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

import java.util.List;

/**
 * Represents a library/package with its metadata and symbols.
 *
 * @since 1.7.0
 */
public class Library {
    private String name;
    private String description;
    private List<TypeDef> typeDefs;
    private List<Client> clients;
    private List<LibraryFunction> functions;
    private List<Service> services;
    private List<Annotation> annotations;
    private String instructions;
    private String readme;
    private List<String> siblingModules;

    public Library(String name, String description) {
        this.name = name;
        this.description = description;
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

    public String getInstructions() {
        return instructions;
    }

    public void setInstructions(String instructions) {
        this.instructions = instructions;
    }

    public String getReadme() {
        return readme;
    }

    public void setReadme(String readme) {
        this.readme = readme;
    }

    public List<String> getSiblingModules() {
        return siblingModules;
    }

    public void setSiblingModules(List<String> siblingModules) {
        this.siblingModules = siblingModules;
    }

    public List<Client> getClients() {
        return clients;
    }

    public void setClients(List<Client> clients) {
        this.clients = clients;
    }

    public List<LibraryFunction> getFunctions() {
        return functions;
    }

    public void setFunctions(List<LibraryFunction> functions) {
        this.functions = functions;
    }

    public List<TypeDef> getTypeDefs() {
        return typeDefs;
    }

    public void setTypeDefs(List<TypeDef> typeDefs) {
        this.typeDefs = typeDefs;
    }

    public List<Service> getServices() {
        return services;
    }

    public void setServices(List<Service> services) {
        this.services = services;
    }

    public List<Annotation> getAnnotations() {
        return annotations;
    }

    public void setAnnotations(List<Annotation> annotations) {
        this.annotations = annotations;
    }
}
