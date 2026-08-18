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

package io.ballerina.flowmodelgenerator.core.copilot.util;

import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.flowmodelgenerator.core.copilot.builder.TypeLinkBuilder;
import io.ballerina.flowmodelgenerator.core.copilot.model.EnumValue;
import io.ballerina.flowmodelgenerator.core.copilot.model.Field;
import io.ballerina.flowmodelgenerator.core.copilot.model.LibraryFunction;
import io.ballerina.flowmodelgenerator.core.copilot.model.Parameter;
import io.ballerina.flowmodelgenerator.core.copilot.model.PathElement;
import io.ballerina.flowmodelgenerator.core.copilot.model.PathSegment;
import io.ballerina.flowmodelgenerator.core.copilot.model.Return;
import io.ballerina.flowmodelgenerator.core.copilot.model.StringPath;
import io.ballerina.flowmodelgenerator.core.copilot.model.Type;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeDef;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeDefMember;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeLink;
import io.ballerina.flowmodelgenerator.core.copilot.model.UnionValue;
import io.ballerina.modelgenerator.commons.FieldData;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.modelgenerator.commons.ReturnTypeData;
import io.ballerina.modelgenerator.commons.TypeDefData;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.copilot.util.TypeSymbolExtractor.extractRecordName;
import static io.ballerina.flowmodelgenerator.core.copilot.util.TypeSymbolExtractor.extractTypeLinksFromSymbol;
import static io.ballerina.modelgenerator.commons.FunctionDataBuilder.REST_RESOURCE_PATH;

/**
 * Utility class for converting data model objects to POJO representations.
 * Handles conversion of FunctionData, TypeDefData, FieldData, and ParameterData to model POJOs.
 *
 * @since 1.7.0
 */
public class LibraryModelConverter {

    private LibraryModelConverter() {
        // Prevent instantiation
    }

    /**
     * Converts FunctionData to LibraryFunction POJO.
     *
     * @param functionData   the function data to convert
     * @param currentOrg     the current package organization
     * @param currentPackage the current package name
     * @return LibraryFunction POJO
     */
    public static LibraryFunction functionDataToModel(FunctionData functionData, String currentOrg,
                                                      String currentPackage) {
        LibraryFunction function = new LibraryFunction();

        // For resource functions, don't add "name" field, add "accessor" and "paths" instead
        boolean isResourceFunction = functionData.kind() == FunctionData.Kind.RESOURCE;

        if (!isResourceFunction) {
            function.setName(functionData.name());
        }

        // Map function kind to human-readable type
        String functionType = getFunctionTypeString(functionData.kind());
        function.setType(functionType);
        function.setDescription(functionData.description());

        // Add resource-specific fields for resource functions
        if (isResourceFunction) {
            // Extract accessor and paths from resourcePath
            String resourcePath = functionData.resourcePath();
            if (resourcePath != null && !resourcePath.isEmpty()) {
                List<PathElement> pathsList = new ArrayList<>();
                function.setAccessor(functionData.name());
                if (REST_RESOURCE_PATH.equals(resourcePath)) {
                    // For rest resource path, add a special path parameter

                    PathSegment pathParam = new PathSegment("path", "...");
                    pathsList.add(pathParam);
                } else {
                    // Parse normal resource paths
                    String[] pathParts = parseResourcePath(resourcePath);

                    // Parse paths array
                    String[] paths = pathParts[1].split("/");
                    for (String path : paths) {
                        if (path.isEmpty()) {
                            continue;
                        }
                        // Check if it's a path parameter (starts with [])
                        if (path.startsWith("[") && path.endsWith("]")) {
                            // Path parameter: extract name and type
                            String paramContent = path.substring(1, path.length() - 1);
                            String[] paramParts = paramContent.split(":");
                            String paramName = paramParts[0].trim();
                            String paramType = paramParts.length > 1 ? paramParts[1].trim() : "string";
                            PathSegment pathParam = new PathSegment(paramName, paramType);
                            pathsList.add(pathParam);
                        } else {
                            // Regular path segment - wrap in StringPath
                            pathsList.add(new StringPath(path));
                        }
                    }
                }
                function.setPaths(pathsList);
            }
        }

        // Add parameters array if present
        if (functionData.parameters() != null) {
            List<Parameter> parametersList = new ArrayList<>();
            for (Map.Entry<String, ParameterData> entry : functionData.parameters().entrySet()) {
                Parameter param = parameterDataToModel(entry.getValue(), currentOrg, currentPackage);
                parametersList.add(param);
            }
            function.setParameters(parametersList);
        }

        // Add return object with type
        Return returnInfo = new Return();
        boolean isConstructor = functionData.kind() == FunctionData.Kind.CLASS_INIT ||
                functionData.kind() == FunctionData.Kind.CONNECTOR ||
                functionData.kind() == FunctionData.Kind.LISTENER_INIT;

        // Use ReturnTypeData if available, otherwise fall back to returnType string
        if (functionData.returnTypeData() != null) {
            ReturnTypeData returnTypeData = functionData.returnTypeData();
            String typeName = returnTypeData.typeSymbol().signature();

            // Extract just the type name if it has module prefix (e.g., "http:Request" -> "Request")
            String simpleTypeName = typeName;
            if (typeName != null && typeName.contains(":")) {
                simpleTypeName = typeName.substring(typeName.lastIndexOf(':') + 1);
            }

            String nameToUse = simpleTypeName;
            List<TypeLink> links = null;

            // Skip link creation for generic/parameterized types (e.g., "map<anydata>", "map<string|string[]>")
            // and primitive/default types (e.g., "()", "[]", "null", "int", "string", etc.)
            boolean isGenericType = simpleTypeName != null && simpleTypeName.contains("<");
            boolean isPrimitiveType = isPrimitiveOrDefaultType(simpleTypeName);
            boolean shouldSkipLinks = isGenericType || isPrimitiveType;

            // For constructors, add internal link to the class itself
            if (isConstructor && simpleTypeName != null && !shouldSkipLinks) {
                links = TypeLinkBuilder.createInternalLinks(simpleTypeName);
            } else if (!shouldSkipLinks && currentOrg != null && currentPackage != null
                    && returnTypeData.typeSymbol() != null) {
                // Extract type links directly from the TypeSymbol
                links = extractTypeLinksFromSymbol(returnTypeData.typeSymbol(), currentOrg, currentPackage);
                links = TypeLinkBuilder.filterInternalExternal(links);

                // Use recordName if we have links after filtering
                if (links != null && !links.isEmpty()) {
                    nameToUse = extractRecordName(returnTypeData.typeSymbol());
                }
            }

            Type returnType = new Type(nameToUse);
            if (links != null && !links.isEmpty()) {
                returnType.setLinks(links);
            }

            returnInfo.setType(returnType);
        } else if (functionData.returnType() != null) {
            // Fallback to old format
            Type returnType = new Type(functionData.returnType());
            returnInfo.setType(returnType);
        }

        function.setReturnInfo(returnInfo);

        return function;
    }

    /**
     * Converts TypeDefData to TypeDef POJO.
     *
     * @param typeDefData    the typedef data to convert
     * @param currentOrg     the current package organization
     * @param currentPackage the current package name
     * @return TypeDef POJO
     */
    public static TypeDef typeDefDataToModel(TypeDefData typeDefData, String currentOrg, String currentPackage) {
        TypeDef typeDef = new TypeDef();
        typeDef.setName(typeDefData.name());
        typeDef.setDescription(typeDefData.description());
        typeDef.setType(typeDefData.type() != null ? typeDefData.type().getValue() : null);

        TypeDefData.TypeCategory category = typeDefData.type();

        // 1. RecordTypeDefinition - only fields
        if (category == TypeDefData.TypeCategory.RECORD && typeDefData.fields() != null) {
            List<Field> fields = new ArrayList<>();
            for (FieldData field : typeDefData.fields()) {
                Field modelField = fieldDataToModel(field, currentOrg, currentPackage);
                fields.add(modelField);
            }
            typeDef.setFields(fields);
            return typeDef;
        }

        // 2. EnumTypeDefinition - only members
        if (category == TypeDefData.TypeCategory.ENUM && typeDefData.fields() != null) {
            List<TypeDefMember> members = new ArrayList<>();
            for (FieldData field : typeDefData.fields()) {
                EnumValue enumValue = new EnumValue();
                enumValue.setName(field.name());
                enumValue.setDescription(field.description());
                members.add(enumValue);
            }
            typeDef.setDescription(typeDefData.description());
            typeDef.setMembers(members);
            return typeDef;
        }

        // 3. UnionTypeDefinition - only members
        if (category == TypeDefData.TypeCategory.UNION && typeDefData.fields() != null) {
            List<TypeDefMember> members = new ArrayList<>();
            for (FieldData field : typeDefData.fields()) {
                String typeName = field.type() != null ? field.type().name() : field.name();
                Type type = new Type(typeName);

                if (field.type() != null && field.type().typeSymbol() != null
                        && currentOrg != null && currentPackage != null) {
                    boolean isGenericType = typeName != null && typeName.contains("<");
                    boolean isPrimitiveType = isPrimitiveOrDefaultType(typeName);
                    if (!isGenericType && !isPrimitiveType) {
                        List<TypeLink> links = extractTypeLinksFromSymbol(
                                field.type().typeSymbol(), currentOrg, currentPackage);
                        if (!links.isEmpty()) {
                            type.setName(extractRecordName(field.type().typeSymbol()));
                            type.setLinks(links);
                        }
                    }
                }

                UnionValue unionValue = new UnionValue(field.name(), type);
                members.add(unionValue);
            }
            typeDef.setMembers(members);
            return typeDef;
        }

        // 4. ClassTypeDefinition - only functions
        if (category == TypeDefData.TypeCategory.CLASS) {
            // Functions should be set separately after creating the TypeDef
            // Just return the base typeDef, functions will be added by the caller
            return typeDef;
        }

        // 5. ConstantTypeDefinition - only value and varType
        if (category == TypeDefData.TypeCategory.CONSTANT) {
            typeDef.setValue(typeDefData.baseType());

            // Set varType if available
            if (typeDefData.baseType() != null) {
                Type varType = new Type();
                varType.setName(typeDefData.baseType());
                typeDef.setVarType(varType);
            }
            return typeDef;
        }

        return typeDef;
    }

    /**
     * Converts FieldData to Field POJO.
     *
     * @param fieldData      the field data to convert
     * @param currentOrg     the current package organization
     * @param currentPackage the current package name
     * @return Field POJO
     */
    public static Field fieldDataToModel(FieldData fieldData, String currentOrg, String currentPackage) {
        Field field = new Field();
        field.setName(fieldData.name());
        field.setDescription(fieldData.description());
        // Only set optional field when it's true
        if (fieldData.optional()) {
            field.setOptional(true);
        }

        // Add type object
        if (fieldData.type() != null) {
            String typeName = fieldData.type().name();

            // Skip link creation for generic/parameterized types and primitive types
            boolean isGenericType = typeName != null && typeName.contains("<");
            boolean isPrimitiveType = isPrimitiveOrDefaultType(typeName);
            boolean shouldSkipLinks = isGenericType || isPrimitiveType;

            // Extract type links if we have the TypeSymbol and org/package info
            List<TypeLink> links = new ArrayList<>();
            String nameToUse = typeName;
            if (!shouldSkipLinks && currentOrg != null && currentPackage != null
                    && fieldData.type().typeSymbol() != null) {
                // Extract type links directly from the TypeSymbol
                links = extractTypeLinksFromSymbol(fieldData.type().typeSymbol(), currentOrg, currentPackage);

                // Use recordName if we have links
                if (!links.isEmpty()) {
                    nameToUse = extractRecordName(fieldData.type().typeSymbol());
                }
            }

            Type type = new Type(nameToUse);
            if (!links.isEmpty()) {
                type.setLinks(links);
            }

            field.setType(type);
        }

        return field;
    }

    /**
     * Converts ParameterData to Parameter POJO.
     *
     * @param paramData      the parameter data to convert
     * @param currentOrg     the current package organization
     * @param currentPackage the current package name
     * @return Parameter POJO
     */
    public static Parameter parameterDataToModel(ParameterData paramData,
                                                 String currentOrg, String currentPackage) {
        Parameter parameter = new Parameter();
        parameter.setName(paramData.name());
        parameter.setDescription(paramData.description());
        // Only set optional field when it's true
        if (paramData.optional()) {
            parameter.setOptional(true);
        }
        parameter.setDefaultValue(paramData.defaultValue());

        // Add type object
        if (paramData.type() != null) {
            String typeName = paramData.type();

            if (!typeName.isEmpty()) {
                // Skip link creation for generic/parameterized types and primitive types
                boolean isGenericType = typeName.contains("<");
                boolean isPrimitiveType = isPrimitiveOrDefaultType(typeName);
                boolean shouldSkipLinks = isGenericType || isPrimitiveType;

                // Extract type links if available
                List<TypeLink> links = new ArrayList<>();
                String nameToUse = typeName;
                if (!shouldSkipLinks && paramData.typeSymbol() != null) {
                    // Extract type links directly from the TypeSymbol
                    links = extractTypeLinksFromSymbol(paramData.typeSymbol(), currentOrg, currentPackage);

                    // Use recordName if we have links
                    if (!links.isEmpty()) {
                        nameToUse = extractRecordName(paramData.typeSymbol());
                    }
                }

                Type type = new Type(nameToUse);
                if (!links.isEmpty()) {
                    type.setLinks(links);
                }

                parameter.setType(type);
            }
        }
        return parameter;
    }

    /**
     * Converts an init method (constructor) to LibraryFunction POJO.
     *
     * @param classSymbol    the class symbol
     * @return LibraryFunction POJO for the constructor
     */
    public static LibraryFunction initMethodToModel(ClassSymbol classSymbol,
                                                    LibraryFunction constructor) {
        // Set name to "init"
        constructor.setName("init");

        Optional<MethodSymbol> initMethod = classSymbol.initMethod();
        if (initMethod.isPresent()) {
            FunctionSymbol functionSymbol = initMethod.get();
            // Set return description from documentation
            constructor.setDescription(functionSymbol.documentation().
                    flatMap(Documentation::description).orElse(""));
            // Create and set return info using the helper method
            functionSymbol.documentation().ifPresent(doc -> {
                Return returnInfo = createReturnInfo(doc);
                // Add type information
                Type returnType = new Type();
                functionSymbol.typeDescriptor().returnTypeDescriptor().ifPresent(returnTypeSymbol -> {
                    returnType.setName(returnTypeSymbol.signature());
                });
                returnInfo.setType(returnType);
                constructor.setReturnInfo(returnInfo);
            });
        }
        return constructor;
    }

    /**
     * Creates and initializes Return info from documentation.
     *
     * @param documentation the function documentation
     * @return Return object with description
     */
    public static Return createReturnInfo(Documentation documentation) {
        Return returnInfo = new Return();

        // Set return description from documentation
        String returnDescription = documentation.returnDescription().orElse("");
        returnInfo.setDescription(returnDescription);

        return returnInfo;
    }

    /**
     * Parses a resource path string to extract accessor and path.
     *
     * @param resourcePath the resource path string
     * @return array with [accessor, path]
     */
    private static String[] parseResourcePath(String resourcePath) {
        String trimmed = resourcePath.trim();
        int firstSlash = trimmed.indexOf('/');

        if (firstSlash > 0) {
            // Format: "accessor /path"
            return new String[]{
                    trimmed.substring(0, firstSlash).trim(),
                    trimmed.substring(firstSlash)
            };
        } else if (firstSlash == 0) {
            // Format: "/path" - remove leading slash
            String path = trimmed.substring(1); // Remove leading /
            return new String[]{"", path};
        } else {
            // No path, just accessor
            return new String[]{trimmed, ""};
        }
    }

    /**
     * Converts FunctionData.Kind to human-readable function type string.
     *
     * @param kind the function kind
     * @return string representation for JSON
     */
    private static String getFunctionTypeString(FunctionData.Kind kind) {
        if (kind == null) {
            return "Normal Function";
        }
        return switch (kind) {
            case CLASS_INIT, CONNECTOR, LISTENER_INIT -> "Constructor";
            case REMOTE -> "Remote Function";
            case RESOURCE -> "Resource Function";
            default -> "Normal Function";
        };
    }

    /**
     * Checks if a type is a primitive or default type that shouldn't have links.
     *
     * @param typeName the type name to check
     * @return true if it's a primitive/default type, false otherwise
     */
    private static boolean isPrimitiveOrDefaultType(String typeName) {
        if (typeName == null || typeName.isEmpty()) {
            return true;
        }

        // Check for default/special types
        return typeName.equals("()") ||
                typeName.equals("[]") ||
                typeName.equals("null") ||
                // Check for primitive types
                typeName.equals("int") ||
                typeName.equals("string") ||
                typeName.equals("boolean") ||
                typeName.equals("float") ||
                typeName.equals("decimal") ||
                typeName.equals("byte") ||
                typeName.equals("any") ||
                typeName.equals("anydata") ||
                typeName.equals("never") ||
                typeName.equals("readonly") ||
                typeName.equals("json") ||
                typeName.equals("xml") ||
                typeName.equals("error");
    }
}
