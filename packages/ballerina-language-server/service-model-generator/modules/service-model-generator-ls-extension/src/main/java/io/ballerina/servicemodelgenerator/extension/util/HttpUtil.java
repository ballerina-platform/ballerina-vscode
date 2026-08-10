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

import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.TypeBuilder;
import io.ballerina.compiler.api.Types;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.HttpResponse;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_PAREN;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DOUBLE_QUOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_HEADER_PARAM_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_PARAM_TYPE_HEADER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_PARAM_TYPE_PAYLOAD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_PARAM_TYPE_QUERY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_PAYLOAD_PARAM_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_QUERY_PARAM_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_PAREN;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TAB;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.extractServicePathInfo;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getAnnotationEdits;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getFunctionQualifiers;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getValueString;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateListenerInfo;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateRequiredFuncsDesignApproachAndServiceType;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateAnnotationAttachmentProperty;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateValue;

/**
 * Utility class for HTTP related operations.
 *
 * @since 1.0.0
 */
public final class HttpUtil {

    public static final Map<String, String> HTTP_CODES;
    public static final Map<String, String> HTTP_CODES_DES;
    private static final String APPLICATION_JSON = "application/json";
    private static final String APPLICATION_OCTET_STREAM = "application/octet-stream";
    private static final String APPLICATION_XML = "application/xml";
    private static final String TEXT_PLAIN = "text/plain";

    public static final String HTTP_RESPONSE_TYPE = "http:Response";

    static {
        Map<String, String> httpCodeMap = new HashMap<>();
        httpCodeMap.put("Continue", "100");
        httpCodeMap.put("SwitchingProtocols", "101");
        httpCodeMap.put("Processing", "102");
        httpCodeMap.put("EarlyHints", "103");
        httpCodeMap.put("Ok", "200");
        httpCodeMap.put("Created", "201");
        httpCodeMap.put("Accepted", "202");
        httpCodeMap.put("NonAuthoritativeInformation", "203");
        httpCodeMap.put("NoContent", "204");
        httpCodeMap.put("ResetContent", "205");
        httpCodeMap.put("PartialContent", "206");
        httpCodeMap.put("MultiStatus", "207");
        httpCodeMap.put("AlreadyReported", "208");
        httpCodeMap.put("IMUsed", "226");
        httpCodeMap.put("MultipleChoices", "300");
        httpCodeMap.put("MovedPermanently", "301");
        httpCodeMap.put("Found", "302");
        httpCodeMap.put("SeeOther", "303");
        httpCodeMap.put("NotModified", "304");
        httpCodeMap.put("UseProxy", "305");
        httpCodeMap.put("TemporaryRedirect", "307");
        httpCodeMap.put("PermanentRedirect", "308");
        httpCodeMap.put("BadRequest", "400");
        httpCodeMap.put("Unauthorized", "401");
        httpCodeMap.put("PaymentRequired", "402");
        httpCodeMap.put("Forbidden", "403");
        httpCodeMap.put("NotFound", "404");
        httpCodeMap.put("MethodNotAllowed", "405");
        httpCodeMap.put("NotAcceptable", "406");
        httpCodeMap.put("ProxyAuthenticationRequired", "407");
        httpCodeMap.put("RequestTimeout", "408");
        httpCodeMap.put("Conflict", "409");
        httpCodeMap.put("Gone", "410");
        httpCodeMap.put("LengthRequired", "411");
        httpCodeMap.put("PreconditionFailed", "412");
        httpCodeMap.put("PayloadTooLarge", "413");
        httpCodeMap.put("UriTooLong", "414");
        httpCodeMap.put("UnsupportedMediaType", "415");
        httpCodeMap.put("RangeNotSatisfiable", "416");
        httpCodeMap.put("ExpectationFailed", "417");
        httpCodeMap.put("MisdirectedRequest", "421");
        httpCodeMap.put("UnprocessableEntity", "422");
        httpCodeMap.put("Locked", "423");
        httpCodeMap.put("FailedDependency", "424");
        httpCodeMap.put("TooEarly", "425");
        httpCodeMap.put("UpgradeRequired", "426");
        httpCodeMap.put("PreconditionRequired", "428");
        httpCodeMap.put("TooManyRequests", "429");
        httpCodeMap.put("RequestHeaderFieldsTooLarge", "431");
        httpCodeMap.put("UnavailableDueToLegalReasons", "451");
        httpCodeMap.put("InternalServerError", "500");
        httpCodeMap.put("NotImplemented", "501");
        httpCodeMap.put("BadGateway", "502");
        httpCodeMap.put("ServiceUnavailable", "503");
        httpCodeMap.put("GatewayTimeout", "504");
        httpCodeMap.put("HttpVersionNotSupported", "505");
        httpCodeMap.put("VariantAlsoNegotiates", "506");
        httpCodeMap.put("InsufficientStorage", "507");
        httpCodeMap.put("LoopDetected", "508");
        httpCodeMap.put("NotExtended", "510");
        httpCodeMap.put("NetworkAuthenticationRequired", "511");
        HTTP_CODES = Collections.unmodifiableMap(httpCodeMap);
    }

    static {
        Map<String, String> httpCodeMap = new HashMap<>();
        httpCodeMap.put("100", "Continue");
        httpCodeMap.put("101", "SwitchingProtocols");
        httpCodeMap.put("102", "Processing");
        httpCodeMap.put("103", "EarlyHints");
        httpCodeMap.put("200", "Ok");
        httpCodeMap.put("201", "Created");
        httpCodeMap.put("202", "Accepted");
        httpCodeMap.put("203", "NonAuthoritativeInformation");
        httpCodeMap.put("204", "NoContent");
        httpCodeMap.put("205", "ResetContent");
        httpCodeMap.put("206", "PartialContent");
        httpCodeMap.put("207", "MultiStatus");
        httpCodeMap.put("208", "AlreadyReported");
        httpCodeMap.put("226", "IMUsed");
        httpCodeMap.put("300", "MultipleChoices");
        httpCodeMap.put("301", "MovedPermanently");
        httpCodeMap.put("302", "Found");
        httpCodeMap.put("303", "SeeOther");
        httpCodeMap.put("304", "NotModified");
        httpCodeMap.put("305", "UseProxy");
        httpCodeMap.put("307", "TemporaryRedirect");
        httpCodeMap.put("308", "PermanentRedirect");
        httpCodeMap.put("400", "BadRequest");
        httpCodeMap.put("401", "Unauthorized");
        httpCodeMap.put("402", "PaymentRequired");
        httpCodeMap.put("403", "Forbidden");
        httpCodeMap.put("404", "NotFound");
        httpCodeMap.put("405", "MethodNotAllowed");
        httpCodeMap.put("406", "NotAcceptable");
        httpCodeMap.put("407", "ProxyAuthenticationRequired");
        httpCodeMap.put("408", "RequestTimeOut");
        httpCodeMap.put("409", "Conflict");
        httpCodeMap.put("410", "Gone");
        httpCodeMap.put("411", "LengthRequired");
        httpCodeMap.put("412", "PreconditionFailed");
        httpCodeMap.put("413", "PayloadTooLarge");
        httpCodeMap.put("414", "UriTooLong");
        httpCodeMap.put("415", "UnsupportedMediaType");
        httpCodeMap.put("416", "RangeNotSatisfiable");
        httpCodeMap.put("417", "ExpectationFailed");
        httpCodeMap.put("421", "MisdirectedRequest");
        httpCodeMap.put("422", "UnprocessableEntity");
        httpCodeMap.put("423", "Locked");
        httpCodeMap.put("424", "FailedDependency");
        httpCodeMap.put("425", "TooEarly");
        httpCodeMap.put("426", "UpgradeRequired");
        httpCodeMap.put("428", "PreconditionRequired");
        httpCodeMap.put("429", "TooManyRequests");
        httpCodeMap.put("431", "RequestHeaderFieldsTooLarge");
        httpCodeMap.put("451", "UnavailableDueToLegalReasons");
        httpCodeMap.put("500", "InternalServerError");
        httpCodeMap.put("501", "NotImplemented");
        httpCodeMap.put("502", "BadGateway");
        httpCodeMap.put("503", "ServiceUnavailable");
        httpCodeMap.put("504", "GatewayTimeout");
        httpCodeMap.put("505", "HttpVersionNotSupported");
        httpCodeMap.put("506", "VariantAlsoNegotiates");
        httpCodeMap.put("507", "InsufficientStorage");
        httpCodeMap.put("508", "LoopDetected");
        httpCodeMap.put("510", "NotExtended");
        httpCodeMap.put("511", "NetworkAuthenticationRequired");
        HTTP_CODES_DES = Collections.unmodifiableMap(httpCodeMap);
    }

    private HttpUtil() {
    }

    public static void populateHttpResponses(FunctionReturnType returnType, SemanticModel semanticModel,
                                             ResourceMethodSymbol resource) {
        Optional<TypeSymbol> returnTypeSymbol = resource.typeDescriptor().returnTypeDescriptor();
        if (returnTypeSymbol.isEmpty()) {
            return;
        }
        Optional<ModuleSymbol> module = resource.getModule();
        String currentModuleName = "";
        if (module.isPresent()) {
            currentModuleName = module.get().getName().orElse("");
        }
        Optional<String> method = resource.getName();
        if (method.isEmpty()) {
            return;
        }
        int defaultStatusCode = method.get().trim().equalsIgnoreCase("post") ? 201 : 200;
        List<HttpResponse> httpResponses = getHttpResponses(returnTypeSymbol.get(), defaultStatusCode, semanticModel,
                currentModuleName);
        returnType.setResponses(httpResponses);
    }

    public static void updateHttpServiceContractModel(Service serviceModel, TypeDefinitionNode serviceTypeNode,
                                                      ServiceDeclarationNode serviceDeclaration) {
        Service commonSvcModel = fromHttpServiceWithContract(serviceTypeNode);
        enableContractFirstApproach(serviceModel);
        updateServiceInfo(serviceModel, commonSvcModel);
        serviceModel.setCodedata(new Codedata(serviceDeclaration.lineRange()));
        populateListenerInfo(serviceModel, serviceDeclaration);
    }

    public static void updateHttpServiceModel(Service serviceModel, ServiceDeclarationNode serviceNode) {
        Service commonSvcModel = Service.getEmptyServiceModel();
        updateServiceInfo(serviceModel, commonSvcModel);
        serviceModel.setCodedata(new Codedata(serviceNode.lineRange()));
        populateListenerInfo(serviceModel, serviceNode);
        updateAnnotationAttachmentProperty(serviceNode, serviceModel);
        extractServicePathInfo(serviceNode, serviceModel);
    }

    private static void updateServiceInfo(Service serviceModel, Service commonSvcModel) {
        populateRequiredFuncsDesignApproachAndServiceType(serviceModel);
        updateValue(serviceModel.getServiceContractTypeNameValue(), commonSvcModel.getServiceContractTypeNameValue());
    }

    public static Service fromHttpServiceWithContract(TypeDefinitionNode serviceTypeNode) {
        Service serviceModel = Service.getEmptyServiceModel();
        Value serviceContractType = new Value.ValueBuilder()
                .enabled(true)
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .value(serviceTypeNode.typeName().text().trim())
                .build();
        serviceModel.setServiceContractTypeName(serviceContractType);
        return serviceModel;
    }

    public static Optional<String> getHttpParamTypeAndSetHeaderName(Parameter parameter,
                                                                    NodeList<AnnotationNode> annotations) {
        for (AnnotationNode annotation : annotations) {
            String annotName = annotation.annotReference().toString();
            String[] annotStrings = annotName.split(COLON);
            if (!annotStrings[0].trim().equals(Constants.HTTP)) {
                continue;
            }
            String annotationReference = annotStrings[annotStrings.length - 1].trim();
            if (annotationReference.equals(HTTP_QUERY_PARAM_ANNOTATION)
                    || annotationReference.equals(HTTP_PAYLOAD_PARAM_ANNOTATION)) {
                return Optional.of(annotationReference);
            }
            if (annotationReference.equals(HTTP_HEADER_PARAM_ANNOTATION)) {
                Optional<MappingConstructorExpressionNode> mappingNode = annotation.annotValue();
                String headerName = mappingNode.isPresent() ? extractFieldValue(mappingNode.get(), "name")
                        : parameter.getName().getValue();
                Value headerNameProperty = new Value.ValueBuilder()
                        .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                        .value(headerName)
                        .enabled(true)
                        .editable(true)
                        .build();
                parameter.setHeaderName(headerNameProperty);
                return Optional.of(annotationReference);
            }
        }
        return Optional.empty();
    }

    private static String extractFieldValue(MappingConstructorExpressionNode mappingNode,
                                            String fieldName) {
        // Parse the mapping constructor to find the specified field
        for (MappingFieldNode field : mappingNode.fields()) {
            if (field instanceof SpecificFieldNode specificField) {
                // Get the field name
                String currentFieldName = specificField.fieldName().toString().trim();

                // Check if this is the field we're looking for
                if (fieldName.equals(currentFieldName)) {
                    // Get the field value
                    ExpressionNode valueExpr = specificField.valueExpr().orElse(null);
                    if (valueExpr instanceof BasicLiteralNode literalNode) {
                        return literalNode.literalToken().text().trim().replaceAll(DOUBLE_QUOTE, "");
                    }
                    if (valueExpr != null) {
                        return valueExpr.toSourceCode().trim();
                    }
                }
            }
        }
        return null; // Return null if field not found
    }

    private static void enableContractFirstApproach(Service service) {
        Value designApproach = service.getDesignApproach();
        if (Objects.nonNull(designApproach) && Objects.nonNull(designApproach.getChoices())
                && !designApproach.getChoices().isEmpty()) {
            designApproach.getChoices().forEach(choice -> choice.setEnabled(false));
            designApproach.getChoices().stream()
                    .filter(choice -> choice.getMetadata().label().equals("Import From OpenAPI Specification"))
                    .findFirst()
                    .ifPresent(approach -> {
                        approach.setEnabled(true);
                        approach.getProperties().remove("spec");
                    });
        }
    }

    private static boolean isDefaultMediaType(String body, String mediaType) {
        if (body.equals("string") && mediaType.equals(TEXT_PLAIN)) {
            return true;
        } else if (body.equals("xml") && mediaType.equals(APPLICATION_XML)) {
            return true;
        } else if (body.equals("json") && mediaType.equals(APPLICATION_JSON)) {
            return true;
        } else if (body.equals("byte[]") && mediaType.equals(APPLICATION_OCTET_STREAM)) {
            return true;
        }
        return mediaType.equals(APPLICATION_JSON) || mediaType.isEmpty();
    }

    private static List<HttpResponse> getHttpResponses(TypeSymbol returnTypeSymbol, int defaultStatusCode,
                                                       SemanticModel semanticModel, String currentModuleName) {
        List<TypeSymbol> statusCodeResponses = new ArrayList<>();
        List<TypeSymbol> anydataResponses = new ArrayList<>();
        List<TypeSymbol> errorResponses = new ArrayList<>();
        Optional<UnionTypeSymbol> unionType = getUnionType(returnTypeSymbol);
        AtomicBoolean hasHttpResponse = new AtomicBoolean(false);

        TypeSymbol errorTypeSymbol = semanticModel.types().ERROR;
        unionType.ifPresentOrElse(
                unionTypeSymbol -> unionTypeSymbol.memberTypeDescriptors().forEach(member -> {
                    if (isSubTypeOfHttpStatusCodeResponse(member, semanticModel)) {
                        statusCodeResponses.add(member);
                    } else if (member.subtypeOf(errorTypeSymbol)) {
                        errorResponses.add(member);
                    } else if (isHttpResponseType(getTypeName(member, currentModuleName))) {
                        hasHttpResponse.set(true);
                    } else {
                        anydataResponses.add(member);
                    }
                }),
                () -> {
                    if (isSubTypeOfHttpStatusCodeResponse(returnTypeSymbol, semanticModel)) {
                        statusCodeResponses.add(returnTypeSymbol);
                    } else if (isHttpResponseType(getTypeName(returnTypeSymbol, currentModuleName))) {
                        hasHttpResponse.set(true);
                    } else if (returnTypeSymbol.subtypeOf(errorTypeSymbol)) {
                        errorResponses.add(returnTypeSymbol);
                    } else {
                        anydataResponses.add(returnTypeSymbol);
                    }
                });
        List<HttpResponse> responses = new ArrayList<>();

        if (hasHttpResponse.get()) {
            HttpResponse dynamicStatusRes = new HttpResponse(String.valueOf(defaultStatusCode), HTTP_RESPONSE_TYPE);
            dynamicStatusRes.setEditable(true);
            dynamicStatusRes.setEnabled(hasHttpResponse.get());
            dynamicStatusRes.setEnabled(true);
            responses.add(dynamicStatusRes);
        }

        statusCodeResponses.stream()
                .map(statusCodeResponse -> getHttpResponse(statusCodeResponse, String.valueOf(defaultStatusCode),
                        semanticModel, currentModuleName))
                .forEach(responses::add);

        Types types = semanticModel.types();
        TypeBuilder typeBuilder = types.builder();
        TypeSymbol stringType = semanticModel.types().STRING;
        TypeSymbol byteArrayType = typeBuilder.ARRAY_TYPE.withType(types.BYTE).build();
        TypeSymbol xmlType = typeBuilder.XML_TYPE.build();

        anydataResponses.forEach(type -> {
            HttpResponse response = new HttpResponse.Builder()
                    .statusCode(String.valueOf(defaultStatusCode), true)
                    .body(getTypeName(type, currentModuleName), true)
                    .mediaType(deriveMediaType(type, stringType, byteArrayType, xmlType), true)
                    .editable(true)
                    .enabled(true)
                    .build();
            responses.add(response);
        });

        errorResponses.stream()
                .map(type -> getTypeName(type, currentModuleName))
                .forEach(type -> {
                    HttpResponse response = new HttpResponse(String.valueOf(500), type);
                    response.setEnabled(true);
                    response.setEditable(true);
                    responses.add(response);
                });

        // sort the responses based on status code
        responses.sort((r1, r2) -> {
            String code1 = r1.getStatusCode().getValue();
            String code2 = r2.getStatusCode().getValue();
            return code1.compareTo(code2);
        });

        return responses;
    }

    private static boolean isHttpResponseType(String type) {
        return type.trim().equals(HTTP_RESPONSE_TYPE);
    }

    public static String generateHttpResourceDefinition(Function function, List<String> newTypeDefinitions,
                                                        Map<String, String> importsForMainBal,
                                                        Map<String, String> importsForTypesBal) {
        StringBuilder builder = new StringBuilder();
        List<String> functionAnnotations = getAnnotationEdits(function, new HashMap<>());
        if (!functionAnnotations.isEmpty()) {
            builder.append(String.join(NEW_LINE, functionAnnotations)).append(NEW_LINE);
        }

        String functionQualifiers = getFunctionQualifiers(function);
        if (!functionQualifiers.isEmpty()) {
            builder.append(functionQualifiers).append(SPACE);
        }
        builder.append("function ");

        Value accessor = function.getAccessor();
        if (Objects.nonNull(accessor) && accessor.isEnabledWithValue()) {
            builder.append(getValueString(accessor).toLowerCase(Locale.ROOT)).append(SPACE);
        }

        // function identifier
        builder.append(getValueString(function.getName()));
        String functionSignature = generateHttpResourceSignature(function, newTypeDefinitions, importsForMainBal,
                importsForTypesBal, true);
        builder.append(functionSignature);

        // function body
        builder.append(OPEN_BRACE).append(NEW_LINE)
                .append(TAB).append("do {").append(NEW_LINE)
                .append(TAB).append("} on fail error err {").append(NEW_LINE)
                .append(TAB).append(TAB).append("// handle error").append(NEW_LINE)
                .append(TAB).append(TAB)
                .append("return error(\"unhandled error\", err);")
                .append(NEW_LINE)
                .append(TAB).append(CLOSE_BRACE)
                .append(NEW_LINE)
                .append(CLOSE_BRACE);

        return builder.toString();
    }

    public static String generateHttpResourceSignature(Function function, List<String> newTypeDefinitions,
                                                       Map<String, String> importsForMainBal,
                                                       Map<String, String> importsForTypesBal,
                                                       boolean isNewResource) {
        StringBuilder builder = new StringBuilder();
        builder.append(OPEN_PAREN)
                .append(generateParams(function.getParameters(), importsForMainBal))
                .append(CLOSE_PAREN);

        int defaultStatusCode = function.getAccessor().getValue().trim().equalsIgnoreCase("post") ? 201 : 200;

        FunctionReturnType returnType = function.getReturnType();
        if (Objects.nonNull(returnType)) {
            if (returnType.isEnabled() && Objects.nonNull(returnType.getResponses()) &&
                    !returnType.getResponses().isEmpty()) {
                List<String> responses = new ArrayList<>(returnType.getResponses().stream()
                        .filter(HttpResponse::isEnabled)
                        .map(response -> HttpUtil.getStatusCodeResponse(response, newTypeDefinitions, importsForMainBal,
                                importsForTypesBal, defaultStatusCode))
                        .filter(Objects::nonNull)
                        .toList());
                if (!responses.isEmpty()) {
                    if (isNewResource && !newTypeDefinitions.contains("error") && !responses.contains("error")) {
                        responses.addFirst("error");
                    }
                    builder.append(" returns ");
                    builder.append(String.join("|", responses));
                }
            }
        }
        builder.append(SPACE);
        return builder.toString();
    }

    private static String generateParams(List<Parameter> parameters, Map<String, String> imports) {
        // Sort params list where required params come first
        parameters.sort(new Parameter.RequiredParamSorter());

        List<String> params = new ArrayList<>();
        for (Parameter param : parameters) {
            if (!param.isEnabled()) {
                continue;
            }

            StringBuilder paramDef = new StringBuilder();
            Value paramType = param.getType();

            // Add imports if present
            if (paramType != null && paramType.getImports() != null) {
                imports.putAll(paramType.getImports());
            }

            Map<String, Value> properties = param.getProperties();

            // Add HTTP annotation if applicable
            String httpParamType = param.getHttpParamType();
            if (HTTP_PARAM_TYPE_HEADER.equals(httpParamType)) {
                // Shared with the generic schema-driven emitter (Utils#generateFunctionParamListSource)
                // so a header parameter renders identically whether it came from an HTTP resource or a
                // schema-driven function's user-added header (see TriggerFunctionAdapter's parameterSchema).
                paramDef.append(Utils.buildHttpHeaderAnnotationPrefix(param, imports));
            } else if (httpParamType != null) {
                Value queryAnnot = properties.get("annotQuery");
                Value payloadAnnot = properties.get("annotPayload");
                if (Objects.nonNull(queryAnnot) && Objects.nonNull(queryAnnot.getValue())) {
                    paramDef.append("@http:").append(HTTP_QUERY_PARAM_ANNOTATION).append(queryAnnot.getValue());
                } else if (Objects.nonNull(payloadAnnot) && Objects.nonNull(payloadAnnot.getValue())) {
                    paramDef.append("@http:").append(HTTP_PAYLOAD_PARAM_ANNOTATION).append(payloadAnnot.getValue());
                } else if (httpParamType.equals(HTTP_PARAM_TYPE_QUERY)) {
                    paramDef.append("@http:").append(HTTP_QUERY_PARAM_ANNOTATION);
                } else if (httpParamType.equals(HTTP_PARAM_TYPE_PAYLOAD)) {
                    paramDef.append("@http:").append(HTTP_PAYLOAD_PARAM_ANNOTATION);
                }
                paramDef.append(SPACE);
            }

            // Build parameter definition
            paramDef.append(getValueString(paramType)).append(" ").append(getValueString(param.getName()));

            // Add default value if present
            Value defaultValue = param.getDefaultValue();
            if (hasEnabledValue(defaultValue)) {
                paramDef.append(" = ").append(getValueString(defaultValue));
            }

            params.add(paramDef.toString());
        }

        return String.join(", ", params);
    }

    private static boolean hasEnabledValue(Value value) {
        return value != null && value.isEnabled() &&
                value.getValue() != null && !value.getValue().isEmpty();
    }

    private static HttpResponse getHttpResponse(TypeSymbol statusCodeResponseType, String defaultStatusCode,
                                                SemanticModel semanticModel, String currentModuleName) {
        String statusCode = getResponseCode(statusCodeResponseType, defaultStatusCode, semanticModel);
        String signature = statusCodeResponseType.signature().trim();
        if (signature.startsWith("record {") && signature.endsWith("}")) {
            return buildHttpResponseFromTypeSymbol(statusCodeResponseType, currentModuleName, statusCode,
                    null, true);
        }
        String typeName = getTypeName(statusCodeResponseType, currentModuleName);
        if (typeName.startsWith("http:")) {
            String type = HTTP_CODES_DES.get(statusCode);
            if (Objects.nonNull(type) && "http:%s".formatted(type).equals(typeName)) {
                return new HttpResponse.Builder()
                        .statusCode(statusCode, true)
                        .type(typeName, true)
                        .body("", true)
                        .name("", true)
                        .headers("", true)
                        .mediaType("", true)
                        .enabled(true)
                        .editable(true)
                        .build();
            }
        }

        return buildHttpResponseFromTypeSymbol(statusCodeResponseType, currentModuleName, statusCode, typeName, false);
    }

    private static HttpResponse buildHttpResponseFromTypeSymbol(TypeSymbol statusCodeResponseType,
                                                                String currentModuleName,
                                                                String statusCode,
                                                                String typeName,
                                                                boolean editable) {
        List<Object> headers = new ArrayList<>();
        String body = "anydata";
        String mediaType = "";
        TypeSymbol rawType = CommonUtils.getRawType(statusCodeResponseType);
        if (rawType.typeKind() == TypeDescKind.RECORD) {
            Map<String, RecordFieldSymbol> fieldSymbolMap = ((RecordTypeSymbol) rawType).fieldDescriptors();
            TypeSymbol headersFieldType = CommonUtils.getRawType(fieldSymbolMap.get("headers").typeDescriptor());
            if (headersFieldType instanceof RecordTypeSymbol headersRecordType) {
                headersRecordType.fieldDescriptors().forEach((name, field) -> {
                    headers.add(Map.of("name", name, "type",
                            getTypeName(field.typeDescriptor(), currentModuleName),
                            "optional", field.isOptional()));
                });
            }
            if (fieldSymbolMap.containsKey("body")) {
                body = getTypeName(fieldSymbolMap.get("body").typeDescriptor(), currentModuleName);
            }
            if (fieldSymbolMap.containsKey("mediaType")) {
                TypeSymbol mediaTypeSymbol = fieldSymbolMap.get("mediaType").typeDescriptor();
                if (!mediaTypeSymbol.signature().equals("string")) {
                    mediaType = mediaTypeSymbol.signature().replaceAll("^\"|\"$", "");
                }
            }
        }
        return new HttpResponse.Builder()
                .statusCode(statusCode, editable)
                .type(typeName, editable)
                .body(body, editable)
                .headers(headers, editable)
                .name("", editable)
                .mediaType(mediaType, editable)
                .editable(editable)
                .enabled(true)
                .build();
    }

    public static boolean isSubTypeOfHttpStatusCodeResponse(TypeSymbol typeSymbol, SemanticModel semanticModel) {
        return isSubTypeOfBallerinaModuleType("StatusCodeResponse", "http", typeSymbol, semanticModel);
    }

    static boolean isSubTypeOfBallerinaModuleType(String type, String moduleName, TypeSymbol typeSymbol,
                                                  SemanticModel semanticModel) {
        Optional<Symbol> optionalRecordSymbol = semanticModel.types().getTypeByName("ballerina", moduleName,
                "", type);
        if (optionalRecordSymbol.isPresent() &&
                optionalRecordSymbol.get() instanceof TypeDefinitionSymbol recordSymbol) {
            return typeSymbol.subtypeOf(recordSymbol.typeDescriptor());
        }
        return false;
    }

    private static String getResponseCode(TypeSymbol typeSymbol, String defaultCode, SemanticModel semanticModel) {
        for (Map.Entry<String, String> entry : HTTP_CODES.entrySet()) {
            if (isSubTypeOfBallerinaModuleType(entry.getKey(), "http", typeSymbol, semanticModel)) {
                return entry.getValue();
            }
        }
        if (isSubTypeOfBallerinaModuleType("DefaultStatusCodeResponse", "http", typeSymbol,
                semanticModel)) {
            return "default";
        }
        return defaultCode;
    }

    static String getTypeName(TypeSymbol typeSymbol, String currentModuleName) {
        String signature = typeSymbol.signature().trim();
        String[] parts = signature.split("[:/]");
        if (parts.length == 4) {
            return parts[1].equals(currentModuleName) ? parts[3] : parts[1] + ":" + parts[3];
        }
        return signature;
    }

    private static Optional<UnionTypeSymbol> getUnionType(TypeSymbol typeSymbol) {
        if (Objects.isNull(typeSymbol)) {
            return Optional.empty();
        }
        return switch (typeSymbol.typeKind()) {
            case UNION -> Optional.of((UnionTypeSymbol) typeSymbol);
            case TYPE_REFERENCE -> getUnionType(((TypeReferenceTypeSymbol) typeSymbol).typeDescriptor());
            default -> Optional.empty();
        };
    }

    private static String deriveMediaType(TypeSymbol typeSymbol, TypeSymbol stringType,
                                          TypeSymbol byteArrayType, TypeSymbol xmlType) {
        if (typeSymbol.subtypeOf(stringType)) {
            return TEXT_PLAIN;
        } else if (typeSymbol.subtypeOf(byteArrayType)) {
            return APPLICATION_OCTET_STREAM;
        } else if (typeSymbol.subtypeOf(xmlType)) {
            return APPLICATION_XML;
        }
        return APPLICATION_JSON;
    }

    public static String getStatusCodeResponse(HttpResponse response, List<String> newTypeDefinitions,
                                               Map<String, String> importsForMainBal,
                                               Map<String, String> importsForTypesBal,
                                               int defaultStatusCode) {
        Value name = response.getName();
        if (Objects.nonNull(name) && name.isEnabledWithValue() && name.isEditable()) {
            String statusCode = response.getStatusCode().getValue();
            String statusCodeRes = HTTP_CODES_DES.get(statusCode);
            if (Objects.isNull(statusCodeRes)) {
                return response.getName().getValue();
            }
            newTypeDefinitions.add(getNewResponseTypeStr(statusCodeRes, response, importsForTypesBal));
            return response.getName().getValue();
        }
        boolean createNewType = false;

        String body = "";
        if (Objects.nonNull(response.getBody()) && response.getBody().isEnabledWithValue()) {
            if (Objects.nonNull(response.getBody().getImports())) {
                importsForMainBal.putAll(response.getBody().getImports());
            }
            body = response.getBody().getValue();
            if (isHttpResponseType(body)) {
                return body;
            }
            if (Integer.parseInt(response.getStatusCode().getValue()) != defaultStatusCode) {
                createNewType = true;
            }
        }
        if (Objects.nonNull(response.getMediaType()) && response.getMediaType().isEnabledWithValue()) {
            String mediaType = response.getMediaType().getValue();
            if (!isDefaultMediaType(body, mediaType)) {
                createNewType = true;
            }
        }
        if (!hasValidHeaderValue(response.getHeaders())) {
            createNewType = true;
        }

        if (createNewType) {
            String statusCode = response.getStatusCode().getValue();
            if (statusCode.equals("500") && body.equals("error")) {
                return "error";
            }
            if (response.getType().isEnabledWithValue() && !response.getType().getValue().startsWith("http:")) {
                if (Objects.nonNull(response.getType().getImports())) {
                    importsForMainBal.putAll(response.getType().getImports());
                }
                return response.getType().getValue();
            }
            String statusCodeRes = HTTP_CODES_DES.get(statusCode);
            return getRecordTypeDescriptor(statusCodeRes, response, importsForMainBal);
        }

        if (Objects.nonNull(body) && !body.isEmpty()) {
            return body;
        }

        if (response.getType().isEnabledWithValue()) {
            if (Objects.nonNull(response.getType().getImports())) {
                importsForMainBal.putAll(response.getType().getImports());
            }
            return response.getType().getValue();
        }

        Value statusCode = response.getStatusCode();
        if (Objects.nonNull(statusCode) && statusCode.isEnabledWithValue()) {
            String statusCodeRes = HTTP_CODES_DES.get(statusCode.getValue().trim());
            if (Objects.nonNull(statusCodeRes)) {
                return "http:" + statusCodeRes;
            }
        }
        return null;
    }

    private static String getString(Object value) {
        if (Objects.isNull(value)) {
            return null;
        }
        if (value instanceof String) {
            return (String) value;
        }
        if (value instanceof JsonPrimitive jsonPrimitive) {
            return jsonPrimitive.getAsString();
        }
        return value.toString();
    }

    private static String getNewResponseTypeStr(String statusCodeTypeName, HttpResponse response,
                                                Map<String, String> imports) {
        String name = response.getName().getValue();
        return "public type " + name + " " + getRecordTypeDescriptor(statusCodeTypeName, response, imports) + ";";
    }

    private static String getRecordTypeDescriptor(String statusCodeTypeName, HttpResponse response,
                                                  Map<String, String> imports) {
        String template = "record {|%n\t*http:%s;".formatted(statusCodeTypeName);

        Value body = response.getBody();
        if (Objects.nonNull(body) && body.isEnabledWithValue()) {
            template += "\t%s body;%n".formatted(body.getValue());
            if (Objects.nonNull(body.getImports())) {
                imports.putAll(body.getImports());
            }
        }

        Value mediaType = response.getMediaType();
        if (Objects.nonNull(mediaType) && mediaType.isEnabledWithValue()) {
            String mediaTypeValue = mediaType.getValue();
            if (!mediaTypeValue.isBlank()) {
                template += "\t\"%s\" mediaType = \"%s\";%n".formatted(mediaTypeValue, mediaTypeValue);
            }
        }

        Value headers = response.getHeaders();
        if (Objects.nonNull(headers) && Objects.nonNull(headers.getValueAsObject())) {
            List<Object> values = headers.getValuesAsObjects();
            StringBuilder headersRecordDef = new StringBuilder("record {|%n".formatted());
            if (Objects.nonNull(values) && !values.isEmpty()) {
                for (Object value : values) {
                    if (value instanceof Map<?, ?> header) {
                        String headerName = getString(header.get("name"));
                        String headerType = getString(header.get("type"));
                        boolean optional = Objects.requireNonNull(getString(header.get("optional"))).contains("true");
                        headerName = optional ? "%s?".formatted(headerName) : headerName;
                        headersRecordDef.append("\t\t%s %s;%n".formatted(headerType, headerName));
                    }
                    if (value instanceof JsonObject header) {
                        String headerName = getString(header.get("name"));
                        String headerType = getString(header.get("type"));
                        boolean optional = Objects.requireNonNull(getString(header.get("optional"))).contains("true");
                        headerName = optional ? "%s?".formatted(headerName) : headerName;
                        headersRecordDef.append("\t\t%s %s;%n".formatted(headerType, headerName));
                    }
                }
            }
            headersRecordDef.append("\t\t(string|int|boolean|string[]|int[]|boolean[])...;%n".formatted());
            headersRecordDef.append("\t|}");
            template += "\t%s headers?;%n".formatted(headersRecordDef);
        }

        template += "|}";
        return template;
    }

    private static boolean hasValidHeaderValue(Value headers) {
        return Objects.isNull(headers) || Objects.isNull(headers.getValuesAsObjects())
                || headers.getValuesAsObjects().isEmpty()
                || (headers.getValuesAsObjects().getFirst().toString().equals("\"\""));
    }
}
