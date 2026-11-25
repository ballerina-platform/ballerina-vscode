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

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.EnumSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.projects.Document;
import org.ballerinalang.langserver.common.utils.CommonUtil;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Finds what a named type holds for a value browser: the values it allows (an enum's members, the singletons of a
 * union such as {@code "CAPTURE"|"AUTHORIZE"}) and, for a record, whether each field opens and the values it allows.
 * Values are expressions that can be written in the given document.
 *
 * @since 1.7.0
 */
public final class TypeShapeFinder {

    /**
     * What a field of a record holds.
     *
     * @param opens  whether the field has something to open: fields, an item of a record list, or enum members
     * @param values the values the field's type allows
     */
    public record FieldShape(boolean opens, List<String> values) {
    }

    /**
     * What a named type holds.
     *
     * @param values the values the type allows
     * @param fields each field of a record type, by name
     */
    public record TypeShape(List<String> values, Map<String, FieldShape> fields) {
    }

    private static final TypeShape NONE = new TypeShape(List.of(), Map.of());

    private TypeShapeFinder() {
    }

    public static TypeShape find(SemanticModel semanticModel, Document document, String type) {
        int colon = type.indexOf(':');
        String name = type.substring(colon + 1);
        Stream<Symbol> symbols = colon < 0
                ? semanticModel.moduleSymbols().stream()
                : importedModule(semanticModel, document, type.substring(0, colon)).stream()
                .flatMap(module -> module.allSymbols().stream());
        Values values = new Values(type.substring(0, colon + 1));
        return symbols.filter(symbol -> symbol.getName().filter(name::equals).isPresent())
                .findFirst()
                .map(values::shapeOf)
                .orElse(NONE);
    }

    private static Optional<ModuleSymbol> importedModule(SemanticModel semanticModel, Document document,
                                                         String prefix) {
        return ((ModulePartNode) document.syntaxTree().rootNode()).imports().stream()
                .filter(importNode -> prefixOf(importNode).equals(prefix))
                .flatMap(importNode -> semanticModel.symbol(importNode).stream())
                .filter(ModuleSymbol.class::isInstance)
                .map(ModuleSymbol.class::cast)
                .findFirst();
    }

    private static String prefixOf(ImportDeclarationNode importNode) {
        return importNode.prefix().map(prefix -> prefix.prefix().text())
                .orElseGet(() -> importNode.moduleName().get(importNode.moduleName().size() - 1).text());
    }

    // Enum members are written with the prefix of the type's module, so only that module's enums are listed.
    private record Values(String prefix) {

        TypeShape shapeOf(Symbol symbol) {
            if (symbol instanceof EnumSymbol enumSymbol) {
                return new TypeShape(members(enumSymbol, symbol), Map.of());
            }
            if (!(symbol instanceof TypeDefinitionSymbol typeDef)) {
                return NONE;
            }
            Map<String, FieldShape> fields = new LinkedHashMap<>();
            recordOf(typeDef.typeDescriptor()).ifPresent(record -> record.fieldDescriptors().forEach(
                    (field, descriptor) -> fields.put(field, fieldShape(descriptor.typeDescriptor(), symbol))));
            return new TypeShape(singletons(typeDef.typeDescriptor()), fields);
        }

        private FieldShape fieldShape(TypeSymbol type, Symbol owner) {
            TypeSymbol value = withoutNil(type);
            Optional<EnumSymbol> enumSymbol = enumOf(value);
            if (enumSymbol.isPresent()) {
                List<String> members = members(enumSymbol.get(), owner);
                return new FieldShape(!members.isEmpty(), members);
            }
            TypeSymbol raw = CommonUtil.getRawType(value);
            boolean opens = recordOf(raw).isPresent()
                    || raw instanceof ArrayTypeSymbol array && recordOf(array.memberTypeDescriptor()).isPresent();
            return new FieldShape(opens, singletons(value));
        }

        // The compiler lists enum members last to first.
        private List<String> members(EnumSymbol enumSymbol, Symbol owner) {
            if (!moduleOf(enumSymbol).equals(moduleOf(owner))) {
                return List.of();
            }
            return enumSymbol.members().reversed().stream().flatMap(member -> member.getName().stream())
                    .map(member -> prefix + member).toList();
        }
    }

    private static Optional<String> moduleOf(Symbol symbol) {
        return symbol.getModule().map(module -> module.id().orgName() + "/" + module.id().moduleName());
    }

    private static Optional<EnumSymbol> enumOf(TypeSymbol type) {
        return type instanceof TypeReferenceTypeSymbol reference && reference.definition() instanceof EnumSymbol e
                ? Optional.of(e) : Optional.empty();
    }

    private static Optional<RecordTypeSymbol> recordOf(TypeSymbol type) {
        TypeSymbol raw = CommonUtil.getRawType(withoutNil(type));
        if (raw instanceof IntersectionTypeSymbol intersection) {
            raw = CommonUtil.getRawType(intersection.effectiveTypeDescriptor());
        }
        return raw instanceof RecordTypeSymbol record ? Optional.of(record) : Optional.empty();
    }

    // The value inside `T?` or `T|error`, which a value has once the nil or error is handled.
    private static TypeSymbol withoutNil(TypeSymbol type) {
        if (!(CommonUtil.getRawType(type) instanceof UnionTypeSymbol union)) {
            return type;
        }
        List<TypeSymbol> members = union.memberTypeDescriptors().stream().filter(member -> !isNilOrError(member))
                .toList();
        return members.size() == 1 ? members.getFirst() : type;
    }

    private static boolean isNilOrError(TypeSymbol type) {
        TypeDescKind kind = CommonUtil.getRawType(type).typeKind();
        return kind == TypeDescKind.NIL || kind == TypeDescKind.ERROR;
    }

    // A union lists values only when every member is a singleton; `string|"VOID"` allows any string.
    private static List<String> singletons(TypeSymbol type) {
        List<TypeSymbol> members = flatten(type).filter(member -> !isNilOrError(member)).toList();
        boolean allSingletons = !members.isEmpty()
                && members.stream().allMatch(member -> member.typeKind() == TypeDescKind.SINGLETON);
        return allSingletons ? members.stream().map(TypeSymbol::signature).toList() : List.of();
    }

    private static Stream<TypeSymbol> flatten(TypeSymbol type) {
        TypeSymbol raw = CommonUtil.getRawType(type);
        return raw instanceof UnionTypeSymbol union
                ? union.memberTypeDescriptors().stream().flatMap(TypeShapeFinder::flatten)
                : Stream.of(raw);
    }
}
