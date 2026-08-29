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

package io.ballerina.flowmodelgenerator.core.copilot.builder;

import io.ballerina.compiler.api.symbols.ConstantSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.EnumSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.modelgenerator.commons.FieldData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.TypeDefData;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.modelgenerator.commons.CommonUtils.getRawType;

/**
 * Builder class for constructing TypeDefData instances from various symbol types.
 * Handles extraction of fields from records, unions, maps, tables, streams, enums, and constants.
 *
 * @since 1.7.0
 */
public class TypeDefDataBuilder {

    private TypeDefDataBuilder() {
        // Prevent instantiation
    }

    /**
     * Builds TypeDefData from a TypeDefinitionSymbol using FunctionDataBuilder's allMembers function.
     *
     * @param typeDefSymbol   the type definition symbol
     * @return TypeDefData instance
     */
    public static TypeDefData buildFromTypeDefinition(TypeDefinitionSymbol typeDefSymbol) {
        String typeName = typeDefSymbol.getName().orElse("");
        String typeDescription = typeDefSymbol.documentation()
                .flatMap(Documentation::description)
                .orElse("");

        TypeSymbol typeDescriptor = typeDefSymbol.typeDescriptor();
        TypeSymbol rawType = getRawType(typeDescriptor);
        TypeDescKind typeKind = rawType.typeKind();

        // Use FunctionDataBuilder.allMembers to extract all type information
        Map<String, TypeSymbol> typeMap = new LinkedHashMap<>();
        FunctionDataBuilder.allMembers(typeMap, typeDescriptor);

        // Determine type category
        TypeDefData.TypeCategory typeCategory = switch (typeKind) {
            case RECORD -> TypeDefData.TypeCategory.RECORD;
            case UNION -> TypeDefData.TypeCategory.UNION;
            case OBJECT -> TypeDefData.TypeCategory.CLASS;
            case ERROR -> TypeDefData.TypeCategory.ERROR;
            default -> TypeDefData.TypeCategory.OTHER;
        };

        // Extract fields based on type
        List<FieldData> fields = new ArrayList<>();
        String baseType = null;

        baseType = switch (typeKind) {
            case RECORD -> {
                extractRecordFields((RecordTypeSymbol) rawType, fields, typeDefSymbol);
                yield typeDescriptor.signature();
            }
            case UNION -> {
                if (typeDefSymbol.kind() == SymbolKind.ENUM) {
                    typeCategory = TypeDefData.TypeCategory.ENUM;
                    extractEnumMembers((EnumSymbol) typeDefSymbol, fields);
                } else {
                    extractUnionMembers((UnionTypeSymbol) rawType, fields);
                }
                yield typeDescriptor.signature();
            }
            case MAP -> extractMapFields((MapTypeSymbol) rawType, fields);
            case TABLE -> {
                extractTableFields((TableTypeSymbol) rawType, fields);
                yield typeDescriptor.signature();
            }
            case STREAM -> {
                extractStreamFields((StreamTypeSymbol) rawType, fields);
                yield typeDescriptor.signature();
            }
            default -> typeDescriptor.signature();
        };

        return new TypeDefData(typeName, typeDescription, typeCategory, fields, baseType);
    }

    /**
     * Builds TypeDefData for a Constant symbol.
     *
     * @param constantSymbol the constant symbol
     * @return TypeDefData instance
     */
    public static TypeDefData buildFromConstant(ConstantSymbol constantSymbol) {
        String typeName = constantSymbol.getName().orElse("");
        String typeDescription = constantSymbol.documentation()
                .flatMap(Documentation::description)
                .orElse("");

        // Get the constant's type and value
        TypeSymbol typeSymbol = constantSymbol.typeDescriptor();

        // Get the constant value if available
        String constantValue = typeSymbol.signature();
        Object constValueObj = constantSymbol.constValue();
        if (constValueObj instanceof ConstantValue constantVal) {
            Object value = constantVal.value();
            if (value != null) {
                constantValue = value.toString();
            }
        }

        return new TypeDefData(typeName, typeDescription, TypeDefData.TypeCategory.CONSTANT,
                new ArrayList<>(), constantValue);
    }

    /**
     * A field name the model can copy into a record literal verbatim. A field whose name is not a legal bare
     * identifier must be written quoted (googleapis.calendar declares {@code 'start} and {@code 'source}) or
     * the emitted Ballerina does not compile. The symbol carries that leading quote only when it was built
     * from source: for a field whose symbol comes from a BALA-loaded dependency the name arrives bare, so
     * requote at emission rather than trusting the symbol.
     *
     * <p>{@link SyntaxInfo#isIdentifier} rather than {@code isKeyword} is the right test: {@code key} is a
     * keyword yet legal bare (ballerina/crypto declares it unquoted), so keying off {@code isKeyword} would
     * quote names that must stay bare. Idempotent -- an already-quoted name is returned unchanged.
     */
    private static String quoteIfRequired(String fieldName) {
        if (fieldName.isEmpty() || fieldName.startsWith("'") || SyntaxInfo.isIdentifier(fieldName)) {
            return fieldName;
        }
        return "'" + fieldName;
    }

    private static void extractRecordFields(RecordTypeSymbol recordType, List<FieldData> fields,
                                            TypeDefinitionSymbol typeDefSymbol) {
        // Get parameter documentation map from type definition
        Map<String, String> parameterDocs = typeDefSymbol.documentation()
                .map(Documentation::parameterMap)
                .orElse(Map.of());

        recordType.fieldDescriptors().forEach((key, fieldSymbol) -> {
            String fieldName = fieldSymbol.getName().orElse(key);

            // Try to get description from parameter documentation first, then fall back to field's own documentation
            String fieldDescription = parameterDocs.getOrDefault(fieldName,
                    fieldSymbol.documentation()
                            .flatMap(Documentation::description)
                            .orElse(""));

            TypeSymbol fieldTypeSymbol = fieldSymbol.typeDescriptor();
            boolean optional = fieldSymbol.isOptional() || fieldSymbol.hasDefaultValue();

            FieldData.FieldType fieldType = new FieldData.FieldType(fieldTypeSymbol.signature(), fieldTypeSymbol);
            fields.add(new FieldData(quoteIfRequired(fieldName), fieldDescription, fieldType, optional));
        });

        // Handle rest field if present and not ANYDATA
        recordType.restTypeDescriptor().ifPresent(restType -> {
            if (restType.typeKind() != TypeDescKind.ANYDATA) {
                FieldData.FieldType fieldType = new FieldData.FieldType(restType.signature(), restType);
                fields.add(new FieldData("", "Rest field", fieldType, false));
            }
        });
    }

    private static void extractUnionMembers(UnionTypeSymbol unionType, List<FieldData> fields) {
        unionType.memberTypeDescriptors().forEach(memberType -> {
            String memberTypeName = memberType.signature();
            FieldData.FieldType fieldType = new FieldData.FieldType(memberTypeName, memberType);
            fields.add(new FieldData(memberTypeName, "Union member", fieldType, false));
        });
    }

    private static void extractEnumMembers(EnumSymbol enumSymbol, List<FieldData> fields) {
        // Extract enum members
        for (ConstantSymbol member : enumSymbol.members()) {
            String memberName = member.getName().orElse("");
            String memberDescription = member.documentation()
                    .flatMap(Documentation::description)
                    .orElse("");

            // Get the constant value if available
            String memberValue = memberName;
            Object constValueObj = member.constValue();
            if (constValueObj instanceof ConstantValue constantValue) {
                Object value = constantValue.value();
                if (value != null) {
                    memberValue = value.toString();
                }
            }

            FieldData.FieldType fieldType = new FieldData.FieldType(memberValue);
            fields.add(new FieldData(memberName, memberDescription, fieldType, false));
        }
    }

    private static String extractMapFields(MapTypeSymbol mapType, List<FieldData> fields) {
        TypeSymbol constraintType = mapType.typeParam();
        String constraintTypeName = constraintType.signature();
        FieldData.FieldType fieldType = new FieldData.FieldType(constraintTypeName, constraintType);
        fields.add(new FieldData("constraint", "Map constraint type", fieldType, false));
        return "map<" + constraintTypeName + ">";
    }

    private static void extractTableFields(TableTypeSymbol tableType, List<FieldData> fields) {
        TypeSymbol rowType = tableType.rowTypeParameter();
        FieldData.FieldType rowFieldType = new FieldData.FieldType(rowType.signature(), rowType);
        fields.add(new FieldData("rowType", "Table row type", rowFieldType, false));

        // Extract key constraint if present
        tableType.keyConstraintTypeParameter().ifPresent(keyType -> {
            FieldData.FieldType keyFieldType = new FieldData.FieldType(keyType.signature(), keyType);
            fields.add(new FieldData("keyConstraint", "Table key constraint", keyFieldType, false));
        });
    }

    private static void extractStreamFields(StreamTypeSymbol streamType, List<FieldData> fields) {
        TypeSymbol streamTypeParam = streamType.typeParameter();
        FieldData.FieldType streamFieldType = new FieldData.FieldType(streamTypeParam.signature(), streamTypeParam);
        fields.add(new FieldData("valueType", "Stream value type", streamFieldType, false));

        TypeSymbol completionType = streamType.completionValueTypeParameter();
        FieldData.FieldType completionFieldType = new FieldData.FieldType(completionType.signature(), completionType);
        fields.add(new FieldData("completionType", "Stream completion type", completionFieldType, false));
    }
}
