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

package io.ballerina.flowmodelgenerator.core.expressioneditor.services;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.LineRange;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Describes the type a field expects, with named types expanded one level, so a caller can tell which fields a record
 * value needs without knowing the type's package.
 *
 * @since 1.0.0
 */
public class ExpectedTypeRequest extends DebouncedExpressionEditorRequest<ExpectedTypeRequest.ExpectedType> {

    private static final String PROBE_VARIABLE = "__reserved__";
    private static final int MAX_RECORD_DEPTH = 3;
    private static final int MAX_RECORDS = 8;

    public ExpectedTypeRequest(ExpressionEditorContext context) {
        super(context);
    }

    @Override
    public ExpectedType getResponse(ExpressionEditorContext context) {
        LineRange lineRange =
                context.generateStatement("any|error __reserved__ = ", ";%s".formatted(System.lineSeparator()));
        Optional<SemanticModel> semanticModel = context.workspaceManager().semanticModel(context.filePath());
        Optional<Document> document = context.workspaceManager().document(context.filePath());
        if (semanticModel.isEmpty() || document.isEmpty()) {
            return new ExpectedType(null);
        }
        return semanticModel.get().visibleSymbols(document.get(), lineRange.endLine()).stream()
                .filter(symbol -> symbol.getName().filter(PROBE_VARIABLE::equals).isPresent())
                .findFirst()
                .filter(VariableSymbol.class::isInstance)
                .map(symbol -> new ExpectedType(describe(((VariableSymbol) symbol).typeDescriptor())))
                .orElseGet(() -> new ExpectedType(null));
    }

    private static String describe(TypeSymbol type) {
        Map<String, String> records = new LinkedHashMap<>();
        String described = type.typeKind() == TypeDescKind.UNION
                ? ((UnionTypeSymbol) type).memberTypeDescriptors().stream()
                        .map(member -> describeMember(member, records))
                        .collect(Collectors.joining(" | "))
                : describeMember(type, records);
        if (records.isEmpty()) {
            return described;
        }
        // A lone record needs no separate first line; its definition leads the list.
        String definitions = String.join(System.lineSeparator(), records.values());
        return records.containsKey(described) ? definitions : described + System.lineSeparator() + definitions;
    }

    private static String describeMember(TypeSymbol type, Map<String, String> records) {
        collectRecords(type, records, 0);
        return type.typeKind() == TypeDescKind.TYPE_REFERENCE ? type.getName().orElse(type.signature())
                : type.signature();
    }

    // Records reachable through fields, arrays, unions and maps, so nested values can be built without a lookup.
    private static void collectRecords(TypeSymbol type, Map<String, String> records, int depth) {
        if (depth > MAX_RECORD_DEPTH || records.size() >= MAX_RECORDS) {
            return;
        }
        switch (type.typeKind()) {
            case TYPE_REFERENCE -> {
                String name = type.getName().orElse(type.signature());
                TypeSymbol definition = ((TypeReferenceTypeSymbol) type).typeDescriptor();
                if (definition.typeKind() != TypeDescKind.RECORD || records.containsKey(name)) {
                    return;
                }
                records.put(name, name + " " + definition.signature() + fieldDocs((RecordTypeSymbol) definition));
                ((RecordTypeSymbol) definition).fieldDescriptors().values()
                        .forEach(field -> collectRecords(field.typeDescriptor(), records, depth + 1));
            }
            case ARRAY -> collectRecords(((ArrayTypeSymbol) type).memberTypeDescriptor(), records, depth);
            case UNION -> ((UnionTypeSymbol) type).memberTypeDescriptors()
                    .forEach(member -> collectRecords(member, records, depth));
            case MAP -> collectRecords(((MapTypeSymbol) type).typeParam(), records, depth);
            default -> {
            }
        }
    }

    // Field docs say what a value holds, e.g. that a string field is a date in yyyy-MM-dd.
    private static String fieldDocs(RecordTypeSymbol record) {
        return record.fieldDescriptors().entrySet().stream()
                .flatMap(field -> field.getValue().documentation().flatMap(Documentation::description).stream()
                        .map(doc -> "%s  %s: %s".formatted(System.lineSeparator(), field.getKey(),
                                doc.strip().replaceAll("\\s+", " "))))
                .collect(Collectors.joining());
    }

    @Override
    public String getKey() {
        return "expectedType";
    }

    @Override
    public long getDelay() {
        return 0;
    }

    /**
     * The expected type, or null when the field's position could not be compiled.
     *
     * @param type the type description
     */
    public record ExpectedType(String type) {
    }
}
