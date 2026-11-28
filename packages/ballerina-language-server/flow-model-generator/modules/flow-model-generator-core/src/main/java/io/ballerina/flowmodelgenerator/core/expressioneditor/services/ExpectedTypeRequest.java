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
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.flowmodelgenerator.core.TypesManager;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.LineRange;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Describes the type a field expects, with named types expanded one level, so a caller can tell which fields a record
 * value needs, or how a class value is made and filled, without knowing the type's package.
 *
 * @since 1.0.0
 */
public class ExpectedTypeRequest extends DebouncedExpressionEditorRequest<ExpectedTypeRequest.ExpectedType> {

    private static final String PROBE_VARIABLE = "__reserved__";
    private static final int MAX_RECORD_DEPTH = 3;
    private static final int MAX_RECORDS = 8;
    private static final int MAX_METHODS = 12;
    private static final int MAX_ALIAS_LENGTH = 200;

    public ExpectedTypeRequest(ExpressionEditorContext context) {
        super(context);
    }

    @Override
    public ExpectedType getResponse(ExpressionEditorContext context) {
        LineRange lineRange =
                context.generateStatement(TypesManager.ANY_ERROR_VARIABLE, ";%s".formatted(System.lineSeparator()));
        Optional<SemanticModel> semanticModel = context.workspaceManager().semanticModel(context.filePath());
        Optional<Document> document = context.workspaceManager().document(context.filePath());
        if (semanticModel.isEmpty() || document.isEmpty()) {
            return new ExpectedType(null);
        }
        return semanticModel.get().visibleSymbols(document.get(), lineRange.endLine()).stream()
                .filter(symbol -> symbol.getName().filter(PROBE_VARIABLE::equals).isPresent())
                .findFirst()
                .filter(VariableSymbol.class::isInstance)
                .map(symbol -> new ExpectedType(describe(((VariableSymbol) symbol).typeDescriptor(),
                        symbol.getModule())))
                .orElseGet(() -> new ExpectedType(null));
    }

    private static String describe(TypeSymbol type, Optional<ModuleSymbol> home) {
        Map<String, String> records = new LinkedHashMap<>();
        List<TypeSymbol> members = type.typeKind() == TypeDescKind.UNION
                ? ((UnionTypeSymbol) type).memberTypeDescriptors() : List.of(type);
        collectRecords(members, records, home);
        // Signatures name other modules' types in full; the client shortens them to the prefix a value writes.
        String described = members.stream().map(TypeSymbol::signature).collect(Collectors.joining(" | "));
        if (records.isEmpty()) {
            return described;
        }
        // A lone record needs no separate first line; its definition leads the list.
        String definitions = String.join(System.lineSeparator(), records.values());
        return records.containsKey(described) ? definitions : described + System.lineSeparator() + definitions;
    }

    // Records and classes reachable through fields, arrays, unions and maps; nearest first, so every union member fits.
    private static void collectRecords(List<TypeSymbol> roots, Map<String, String> records,
                                       Optional<ModuleSymbol> home) {
        Deque<Map.Entry<TypeSymbol, Integer>> queue = new ArrayDeque<>();
        roots.forEach(root -> queue.add(Map.entry(root, 0)));
        while (!queue.isEmpty() && records.size() < MAX_RECORDS) {
            Map.Entry<TypeSymbol, Integer> next = queue.poll();
            TypeSymbol type = next.getKey();
            int depth = next.getValue();
            switch (type.typeKind()) {
                case TYPE_REFERENCE -> collectNamed(type, records, depth, home, queue);
                case ARRAY -> queue.add(Map.entry(((ArrayTypeSymbol) type).memberTypeDescriptor(), depth));
                case UNION -> ((UnionTypeSymbol) type).memberTypeDescriptors()
                        .forEach(member -> queue.add(Map.entry(member, depth)));
                case MAP -> queue.add(Map.entry(((MapTypeSymbol) type).typeParam(), depth));
                default -> {
                }
            }
        }
    }

    private static void collectNamed(TypeSymbol type, Map<String, String> records, int depth,
                                     Optional<ModuleSymbol> home, Deque<Map.Entry<TypeSymbol, Integer>> queue) {
        String name = type.signature();
        TypeSymbol definition = ((TypeReferenceTypeSymbol) type).typeDescriptor();
        if (records.containsKey(name)) {
            return;
        }
        if (definition instanceof ObjectTypeSymbol object) {
            records.put(name, describeObject(name, object, home));
        } else if (definition instanceof RecordTypeSymbol record) {
            records.put(name, name + " " + record.signature() + defaultedFields(record) + fieldDocs(record));
            if (depth < MAX_RECORD_DEPTH) {
                record.fieldDescriptors().values()
                        .forEach(field -> queue.add(Map.entry(field.typeDescriptor(), depth + 1)));
            }
        } else if (definition.signature().length() <= MAX_ALIAS_LENGTH) {
            // A name for another type, e.g. a tuple or a union of constants, is only usable once its shape is known.
            records.put(name, name + " = " + definition.signature());
        }
    }

    // A class or object is made with new and changed through its methods, so those are what a value of it needs.
    private static String describeObject(String name, ObjectTypeSymbol object, Optional<ModuleSymbol> home) {
        String made = object instanceof ClassSymbol classSymbol
                ? "class, made with new(%s)".formatted(classSymbol.initMethod()
                        .map(init -> parameters(init.typeDescriptor())).orElse(""))
                : "object type";
        boolean local = sameModule(object, home);
        List<String> methods = object.methods().values().stream()
                .filter(method -> local ? !method.qualifiers().contains(Qualifier.PRIVATE) : isVisible(method))
                .limit(MAX_METHODS)
                .map(ExpectedTypeRequest::methodSignature)
                .toList();
        return methods.isEmpty() ? "%s %s".formatted(name, made)
                : "%s %s; methods: %s".formatted(name, made, String.join("; ", methods));
    }

    private static boolean isVisible(MethodSymbol method) {
        return method.qualifiers().contains(Qualifier.PUBLIC) || method.qualifiers().contains(Qualifier.REMOTE);
    }

    private static boolean sameModule(Symbol symbol, Optional<ModuleSymbol> home) {
        return symbol.getModule().map(ModuleSymbol::id).map(Object::toString)
                .equals(home.map(ModuleSymbol::id).map(Object::toString));
    }

    private static String methodSignature(MethodSymbol method) {
        String returns = method.typeDescriptor().returnTypeDescriptor()
                .filter(type -> type.typeKind() != TypeDescKind.NIL)
                .map(type -> " returns " + type.signature())
                .orElse("");
        return "%s(%s)%s".formatted(method.getName().orElse(""), parameters(method.typeDescriptor()), returns);
    }

    private static String parameters(FunctionTypeSymbol function) {
        String params = function.params().orElse(List.of()).stream()
                .map(ParameterSymbol::signature)
                .collect(Collectors.joining(", "));
        return function.restParam().map(rest -> params.isEmpty() ? rest.signature() : params + ", " + rest.signature())
                .orElse(params);
    }

    // The signature drops default values, so without this every defaulted field reads as one a value must set.
    private static String defaultedFields(RecordTypeSymbol record) {
        String names = record.fieldDescriptors().entrySet().stream()
                .filter(field -> field.getValue().hasDefaultValue())
                .map(Map.Entry::getKey)
                .collect(Collectors.joining(", "));
        return names.isEmpty() ? "" : " Leave out unless asked; defaults apply: " + names + ".";
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
