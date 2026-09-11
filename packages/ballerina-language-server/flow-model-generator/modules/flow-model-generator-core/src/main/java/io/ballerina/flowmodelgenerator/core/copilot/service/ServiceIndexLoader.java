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

package io.ballerina.flowmodelgenerator.core.copilot.service;

import io.ballerina.flowmodelgenerator.core.copilot.model.Listener;
import io.ballerina.flowmodelgenerator.core.copilot.model.Parameter;
import io.ballerina.flowmodelgenerator.core.copilot.model.Return;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceRemoteFunction;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.modelgenerator.commons.ServiceDatabaseManager;
import io.ballerina.modelgenerator.commons.ServiceTypeFunction;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Loads Copilot service descriptors from the service-index.sqlite database
 * (built from service_artifacts.json) as a replacement for the inbuilt-triggers JSON files.
 *
 * @since 1.7.0
 */
class ServiceIndexLoader {

    private static final Logger LOGGER = Logger.getLogger(ServiceIndexLoader.class.getName());

    private static final Set<ParameterData.Kind> LISTENER_PARAM_KINDS = Set.of(
            ParameterData.Kind.REQUIRED,
            ParameterData.Kind.DEFAULTABLE,
            ParameterData.Kind.INCLUDED_RECORD,
            ParameterData.Kind.REST_PARAMETER);

    private ServiceIndexLoader() {
        // Prevent instantiation
    }

    /**
     * Loads services from the service-index.sqlite database for the given library.
     * Each service entry carries a {@code name} field (the service-type name, e.g.
     * {@code "IssuesService"}) used by {@link CopilotDeprecationEnricher} to apply
     * deprecation flags post-load; the SQLite index does not store deprecation.
     *
     * @param libraryName the library name (e.g., "ballerinax/kafka")
     * @return the services, or an empty list on failure
     */
    static List<Service> loadFromServiceIndex(String libraryName) {
        List<Service> services = new ArrayList<>();

        String packageName = stripOrg(libraryName);
        String org = libraryName.contains("/")
                ? libraryName.substring(0, libraryName.indexOf('/'))
                : "ballerinax";

        try {
            ServiceDatabaseManager db = ServiceDatabaseManager.getInstance();

            Optional<FunctionData> listenerOpt = db.getListener(org, packageName);
            if (listenerOpt.isEmpty()) {
                LOGGER.warning("No listener found in service-index for: " + libraryName);
                return services;
            }

            FunctionData listenerData = listenerOpt.get();
            int listenerId = listenerData.functionId();
            int packageId = Integer.parseInt(listenerData.packageId());

            Listener listener = buildListenerFromDb(db, packageName, listenerId);

            List<String> serviceTypes = db.getServiceTypes(packageId);

            if (serviceTypes.isEmpty()) {
                // No service types: emit single entry with just listener, no methods
                Service svc = new Service();
                svc.setType("fixed");
                svc.setListener(listener);
                services.add(svc);
                return services;
            }

            for (String serviceTypeName : serviceTypes) {
                Service svc = new Service();
                svc.setType("fixed");
                svc.setName(serviceTypeName);
                svc.setListener(listener);

                List<ServiceRemoteFunction> methods =
                        buildMethodsFromDb(db, packageId, serviceTypeName, packageName);
                if (!methods.isEmpty()) {
                    svc.setMethods(methods);
                }

                services.add(svc);
            }
        } catch (RuntimeException e) {
            LOGGER.warning("Failed to load services from service-index for " + libraryName
                    + ": " + e.getMessage());
            return new ArrayList<>();
        }

        return services;
    }

    private static Listener buildListenerFromDb(ServiceDatabaseManager db, String packageName,
                                                   int listenerId) {
        Listener listener = new Listener();
        listener.setName(getAlias(packageName) + ":Listener");

        List<Parameter> parameters = new ArrayList<>();
        LinkedHashMap<String, ParameterData> params = db.getFunctionParametersAsMap(listenerId);

        for (ParameterData param : params.values()) {
            // Filter: only top-level params, not flattened included-record fields
            if (!LISTENER_PARAM_KINDS.contains(param.kind())) {
                continue;
            }

            Parameter parameter = new Parameter();
            parameter.setName(param.name());
            parameter.setDescription(param.description() != null ? param.description() : "");

            String typeStr = param.type() != null ? param.type() : "";
            parameter.setType(TypeResolver.resolveTypeWithLinks(typeStr, packageName));

            if (param.optional()) {
                parameter.setOptional(true);
            }

            // Use placeholder as "default" (matching how the old path maps placeholder → default)
            if (param.placeholder() != null && !param.placeholder().isEmpty()) {
                parameter.setDefaultValue(param.placeholder());
            }

            parameters.add(parameter);
        }

        listener.setParameters(parameters);
        return listener;
    }

    private static List<ServiceRemoteFunction> buildMethodsFromDb(ServiceDatabaseManager db, int packageId,
                                                 String serviceTypeName, String packageName) {
        List<ServiceRemoteFunction> methods = new ArrayList<>();

        List<ServiceTypeFunction> functions = db.getMatchingServiceTypeFunctions(packageId, serviceTypeName);

        for (ServiceTypeFunction fn : functions) {
            ServiceRemoteFunction method = new ServiceRemoteFunction();

            // Method name
            if (fn.name() != null && !fn.name().isEmpty()) {
                method.setName(fn.name());
            }

            // Map kind to lowercase type
            String methodType = "RESOURCE".equalsIgnoreCase(fn.kind()) ? "resource" : "remote";
            method.setType(methodType);

            if (fn.description() != null && !fn.description().isEmpty()) {
                method.setDescription(fn.description());
            }

            // Parameters. Left as the constructor's empty list when the index reports none, which is how
            // the wire has always carried a param-less index method.
            if (fn.parameters() != null && !fn.parameters().isEmpty()) {
                List<Parameter> parameters = new ArrayList<>();
                for (ServiceTypeFunction.ServiceTypeFunctionParameter p : fn.parameters()) {
                    Parameter parameter = new Parameter();
                    parameter.setName(p.name());

                    if (p.description() != null && !p.description().isEmpty()) {
                        parameter.setDescription(p.description());
                    }

                    String typeStr = p.type() != null ? p.type() : "";
                    parameter.setType(TypeResolver.resolveTypeWithLinks(typeStr, packageName));

                    // Map kind to optional flag
                    if ("OPTIONAL".equalsIgnoreCase(p.kind()) || "DEFAULTABLE".equalsIgnoreCase(p.kind())) {
                        parameter.setOptional(true);
                    }

                    parameters.add(parameter);
                }
                method.setParameters(parameters);
            }

            // Return type
            if (fn.returnType() != null && !fn.returnType().isEmpty()) {
                String canonicalized = canonicalizeReturnType(fn.returnType());
                Return returnValue = new Return();
                returnValue.setType(TypeResolver.resolveTypeWithLinks(canonicalized, packageName));
                method.setReturnInfo(returnValue);
            }

            methods.add(method);
        }

        return methods;
    }

    /**
     * Canonicalizes return type signatures from the DB by collapsing union-with-nil forms
     * (e.g., {@code "error|()"}) to the shorthand nullable form ({@code "error?"}). Splits
     * only on top-level {@code |} so parenthesized unions such as {@code "(int|string)|()"}
     * are handled correctly.
     *
     * @param signature the raw return type string from the DB
     * @return the canonicalized form
     * @since 1.7.0
     */
    static String canonicalizeReturnType(String signature) {
        if (signature == null || signature.isEmpty()) {
            return "";
        }

        String trimmed = signature.trim();
        if (!trimmed.contains("()")) {
            return trimmed;
        }

        List<String> members = new ArrayList<>();
        boolean hadNil = false;
        int depth = 0;
        int start = 0;
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
            } else if (c == '|' && depth == 0) {
                String member = trimmed.substring(start, i).trim();
                if ("()".equals(member)) {
                    hadNil = true;
                } else {
                    members.add(member);
                }
                start = i + 1;
            }
        }
        String last = trimmed.substring(start).trim();
        if ("()".equals(last)) {
            hadNil = true;
        } else {
            members.add(last);
        }

        if (!hadNil) {
            return trimmed;
        }
        if (members.isEmpty()) {
            return "()";
        }

        String joined = String.join("|", members);
        return joined.endsWith("?") ? joined : joined + "?";
    }

    static String stripOrg(String libraryName) {
        int idx = libraryName.indexOf('/');
        return idx >= 0 ? libraryName.substring(idx + 1) : libraryName;
    }

    private static String getAlias(String packageName) {
        if (packageName.contains(".")) {
            return packageName.substring(packageName.lastIndexOf('.') + 1);
        }
        return packageName;
    }
}
