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

package io.ballerina.flowmodelgenerator.core.type;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import org.ballerinalang.diagramutil.connector.models.connector.Type;
import org.ballerinalang.diagramutil.connector.models.connector.types.ArrayType;
import org.ballerinalang.diagramutil.connector.models.connector.types.IntersectionType;
import org.ballerinalang.diagramutil.connector.models.connector.types.RecordType;
import org.ballerinalang.diagramutil.connector.models.connector.types.UnionType;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Analyzes the record value and updates the type configuration.
 *
 * @since 1.0.0
 */
public class TypeSymbolAnalyzerFromTypeModel {

    public static Type analyze(Symbol typeSymbol, String expr, SemanticModel semanticModel) {
        // Rest of your existing type processing logic
        ExpressionNode expressionNode = NodeParser.parseExpression(expr);
        Type type = Type.fromSemanticSymbol(typeSymbol, semanticModel);

        if (expressionNode instanceof MappingConstructorExpressionNode mapping) {
            if (type instanceof RecordType recordType) {
                TypeSymbolAnalyzerFromTypeModel.updateTypeConfig(recordType, mapping);
            } else if (type instanceof UnionType unionType) {
                TypeSymbolAnalyzerFromTypeModel.updateUnionTypeConfig(unionType, mapping);
            } else if (type instanceof IntersectionType intersectionType) {
                TypeSymbolAnalyzerFromTypeModel.updateIntersectionTypeConfig(intersectionType, mapping);
            }
        } else {
            throw new IllegalArgumentException("Invalid expression");
        }

        return type;
    }

    private static void updateIntersectionTypeConfig(IntersectionType intersectionType,
                                                     MappingConstructorExpressionNode mappingConstructor) {
        for (Type type : intersectionType.members) {
            if (updateIntersectionMemberConfig(type, mappingConstructor)) {
                intersectionType.selected = true;
                break;
            }
        }
    }

    private static boolean updateIntersectionMemberConfig(Type type,
                                                          MappingConstructorExpressionNode mappingConstructor) {
        if (type instanceof RecordType recordType) {
            updateTypeConfig(recordType, mappingConstructor);
            return recordType.selected;
        }
        if (type instanceof IntersectionType nestedIntersectionType) {
            updateIntersectionTypeConfig(nestedIntersectionType, mappingConstructor);
            return nestedIntersectionType.selected;
        }
        return false;
    }

    private static void updateUnionTypeConfig(UnionType unionType,
                                             MappingConstructorExpressionNode mappingConstructor) {
        List<Type> selectedTypes = new ArrayList<>();
        for (Type type : unionType.members) {
            if (type instanceof RecordType recordType) {
                updateTypeConfig(recordType, mappingConstructor);
            }
            if (type.selected) {
                selectedTypes.add(type);
            }
        }
        if (selectedTypes.size() == 1) {
            unionType.selected = true;
        } else {
           for (Type type : selectedTypes) {
               reset(type);
           }
        }
    }

    private static void updateTypeConfig(RecordType recordType, MappingConstructorExpressionNode mappingConstructor) {
        Map<String, Type> fieldMap = new HashMap<>();
        Map<String, String> requiredFields = new HashMap<>();
        recordType.fields.forEach(f -> {
            fieldMap.put(f.name, f);
            if (!f.optional && !f.defaultable) {
                requiredFields.put(f.name, f.name);
            }
        });

        boolean matched = true;
        for (MappingFieldNode fieldNode: mappingConstructor.fields()) {
            if (!(fieldNode instanceof SpecificFieldNode specificFieldNode)) {
                matched = false;
                break;
            }
            String fieldName = specificFieldNode.fieldName().toSourceCode().trim();
            Type matchingType = fieldMap.get(fieldName);

            if (Objects.isNull(matchingType)) {
                matched = false;
                break;
            }

            ExpressionNode expr;
            if (specificFieldNode.valueExpr().isPresent()) {
                expr = specificFieldNode.valueExpr().get();
                if (expr instanceof MappingConstructorExpressionNode mapping) {
                    if (matchingType instanceof RecordType rt) {
                        updateTypeConfig(rt, mapping);
                    } else if (matchingType instanceof UnionType ut) {
                        updateUnionTypeConfig(ut, mapping);
                    }
                } else if (expr instanceof ListConstructorExpressionNode listExpr
                        && matchingType instanceof ArrayType arrayType) {
                    updateArrayTypeConfig(arrayType, listExpr);
                } else {
                    if (matchingType instanceof UnionType ut) {
                        for (Type memberType : ut.members) {
                            if (memberType.typeName.equals(sanitizeValue(expr.toSourceCode()))) {
                                memberType.selected = true;
                                break;
                            }
                        }
                    }
                    matchingType.value = expr.toSourceCode();
                    matchingType.selected = true;
                }
                requiredFields.remove(fieldName);
            } else {
                matchingType.value = fieldName;
                matchingType.selected = true;
                requiredFields.remove(fieldName);
            }
        }
        if (!requiredFields.values().isEmpty() || !matched) {
            reset(recordType);
        } else {
            recordType.selected = true;
        }
    }

    private static void updateArrayTypeConfig(ArrayType arrayType,
                                              ListConstructorExpressionNode listExpr) {
        arrayType.elements = new ArrayList<>();
        for (var memberExpr : listExpr.expressions()) {
            Type element = arrayType.memberType.copy();
            if (memberExpr instanceof MappingConstructorExpressionNode mapping) {
                if (element instanceof RecordType rt) {
                    updateTypeConfig(rt, mapping);
                } else if (element instanceof UnionType ut) {
                    updateUnionTypeConfig(ut, mapping);
                }
            } else if (memberExpr instanceof ListConstructorExpressionNode nestedList
                    && element instanceof ArrayType nestedArray) {
                updateArrayTypeConfig(nestedArray, nestedList);
            } else {
                element.value = memberExpr.toSourceCode().trim();
                element.selected = true;
            }
            arrayType.elements.add(element);
        }
        arrayType.selected = true;
    }

    private static void reset(Type type) {
        type.selected = false;
        type.value = "";
        if (type instanceof RecordType rt) {
            for (Type field : rt.fields) {
                reset(field);
            }
        } else if (type instanceof ArrayType at) {
            at.elements = null;
        }
    }

    private static String sanitizeValue(String value) {
        return value.replace("\"", "").trim();
    }
}
