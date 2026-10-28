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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.api.symbols.Annotatable;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ServiceDeclarationSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;

import java.util.ArrayList;
import java.util.List;

/**
 * Maps Ballerina types of a GraphQL service to the GraphQL types its schema exposes, in SDL notation.
 *
 * <p>This mirrors the type mapping of the GraphQL compiler plugin's schema generator ({@code @graphql:ID}, nullability
 * from {@code T?}, error members dropped, lists, subscription streams, aliases) instead of calling it, because the
 * plugin is not available to the language server at runtime: it ships only inside the {@code ballerina/graphql}
 * package's bala, and neither the packed server jar nor the distribution's runtime libraries contain it. Calling
 * {@code io.ballerina.stdlib.graphql.compiler.Utils} from the server fails with {@code NoClassDefFoundError}. It is
 * shared by every view that shows a GraphQL service, so they agree on the notation.
 *
 * @since 1.7.0
 */
public final class GraphqlTypeMapper {

    private static final String GRAPHQL_MODULE = "graphql";
    private static final String LISTENER_TYPE = "Listener";
    private static final String ID_TYPE = "ID";
    private static final List<String> INJECTED_PARAM_TYPES = List.of("Context", "Field");
    private static final String NON_NULL = "!";
    private static final String NIL_DEFAULT = "()";
    private static final String SUBSCRIBE_ACCESSOR = "subscribe";

    private GraphqlTypeMapper() {
    }

    /**
     * Returns whether the service is attached to a {@code graphql:Listener}.
     */
    public static boolean isGraphqlService(ServiceDeclarationSymbol serviceSymbol) {
        return serviceSymbol.listenerTypes().stream().anyMatch(GraphqlTypeMapper::isGraphqlListener);
    }

    /**
     * Maps a Ballerina type to its GraphQL type reference. A type is non-null unless it admits nil; error members
     * are dropped, since an error surfaces in the response's {@code errors} list rather than in the field type.
     *
     * @param typeSymbol the Ballerina type
     * @param isId       whether the type is annotated with {@code @graphql:ID}
     * @return the GraphQL type, e.g. {@code [Book!]!}
     */
    public static String toSdl(TypeSymbol typeSymbol, boolean isId) {
        // An alias that is not a schema type of its own (e.g. `type Books Book[]`, `type MaybeBook Book?`) shows its
        // list shape and nullability, as if written inline.
        if (typeSymbol instanceof TypeReferenceTypeSymbol reference && !isSchemaType(reference)) {
            return toSdl(reference.typeDescriptor(), isId);
        }
        if (typeSymbol instanceof IntersectionTypeSymbol intersection) {
            TypeSymbol shape = withoutReadonly(intersection);
            if (shape != intersection) {
                return toSdl(shape, isId);
            }
        }
        if (typeSymbol instanceof UnionTypeSymbol union) {
            List<TypeSymbol> members = valueMembers(union);
            boolean nullable = admitsNil(union);
            if (members.size() == 1) {
                String member = toSdl(members.get(0), isId);
                return nullable ? withoutNonNull(member) : member;
            }
            // An anonymous union has no SDL name of its own (and the schema generator rejects one that mixes scalars
            // and objects), so show its members, each in GraphQL terms, grouped so the `!` reads as applying to all.
            String memberList = String.join("|", members.stream()
                    .map(member -> withoutNonNull(toSdl(member, isId))).toList());
            return nullable ? "(" + memberList + ")" : "(" + memberList + ")" + NON_NULL;
        }
        return toNamedType(typeSymbol, isId) + NON_NULL;
    }

    /**
     * Maps the type of a record field. An optional field ({@code name?}) may be absent from the value, so it is
     * nullable in the schema whatever its type.
     */
    public static String toFieldSdl(TypeSymbol typeSymbol, boolean isId, boolean isOptional) {
        String type = toSdl(typeSymbol, isId);
        return isOptional ? withoutNonNull(type) : type;
    }

    /**
     * Returns the element type of a subscription's {@code stream<T>} return type, which is the field's type.
     */
    public static TypeSymbol unwrapStream(TypeSymbol type) {
        TypeSymbol rawType = CommonUtils.getRawType(type);
        // `stream<T, error?>|error`: the stream is the only member that is neither nil nor an error.
        if (rawType instanceof UnionTypeSymbol union) {
            List<TypeSymbol> members = valueMembers(union);
            if (members.size() == 1) {
                rawType = CommonUtils.getRawType(members.get(0));
            }
        }
        return rawType instanceof StreamTypeSymbol streamType ? streamType.typeParameter() : type;
    }

    /**
     * Returns whether a resource accessor defines a subscription field.
     */
    public static boolean isSubscriptionAccessor(String accessor) {
        return SUBSCRIBE_ACCESSOR.equals(accessor);
    }

    /**
     * Returns the default value of an argument as written, or {@code null} if it has none. A default makes the
     * argument optional to pass even when its type is non-null (e.g. {@code name: String! = ""}). A nil default is
     * dropped: it only makes the argument optional, which its nullable type already says.
     */
    public static String getDefaultValue(DefaultableParameterNode parameterNode) {
        String value = parameterNode.expression().toSourceCode().trim();
        return NIL_DEFAULT.equals(value) ? null : value;
    }

    /**
     * {@code graphql:Context} and {@code graphql:Field} parameters are injected by the runtime, not schema arguments.
     */
    public static boolean isInjectedParam(TypeSymbol type) {
        return type.typeKind() == TypeDescKind.TYPE_REFERENCE && isFromGraphqlModule(type)
                && type.getName().map(INJECTED_PARAM_TYPES::contains).orElse(false);
    }

    /**
     * Returns whether the construct is annotated with {@code @graphql:ID}.
     */
    public static boolean hasIdAnnotation(Annotatable annotatable) {
        return annotatable.annotations().stream()
                .anyMatch(annotation -> isFromGraphqlModule(annotation)
                        && annotation.getName().map(ID_TYPE::equals).orElse(false));
    }

    /**
     * GraphQL names are the unescaped Ballerina identifiers, e.g. {@code 'type} is exposed as {@code type}.
     */
    public static String unescape(String identifier) {
        String name = identifier.startsWith("'") ? identifier.substring(1) : identifier;
        return name.replaceAll("\\\\(.)", "$1");
    }

    /**
     * Whether a referenced type is named in the schema: an object (record, class, object type), an enum, or a union
     * of several object types. Any other alias (a scalar, a list, {@code T?}, {@code T|error}) is only a Ballerina
     * name for a shape the schema spells out.
     */
    private static boolean isSchemaType(TypeReferenceTypeSymbol reference) {
        SymbolKind definitionKind = reference.definition().kind();
        if (definitionKind == SymbolKind.ENUM || definitionKind == SymbolKind.CLASS) {
            return true;
        }
        TypeSymbol referred = reference.typeDescriptor();
        if (referred instanceof IntersectionTypeSymbol intersection) {
            referred = withoutReadonly(intersection);
        }
        return switch (referred.typeKind()) {
            case RECORD, OBJECT -> true;
            case UNION -> valueMembers((UnionTypeSymbol) referred).size() > 1;
            default -> false;
        };
    }

    /**
     * {@code readonly & T} has the shape of {@code T}; the effective type would be an anonymous immutable copy.
     */
    private static TypeSymbol withoutReadonly(IntersectionTypeSymbol intersection) {
        List<TypeSymbol> shapes = intersection.memberTypeDescriptors().stream()
                .filter(member -> member.typeKind() != TypeDescKind.READONLY)
                .toList();
        return shapes.size() == 1 ? shapes.get(0) : intersection;
    }

    /**
     * The union members a value can be: nil makes the type nullable and an error goes to the response's
     * {@code errors}, so neither is a schema type. The members are taken as written, since memberTypeDescriptors()
     * would flatten a referenced union into its members.
     */
    private static List<TypeSymbol> valueMembers(UnionTypeSymbol union) {
        List<TypeSymbol> members = new ArrayList<>();
        for (TypeSymbol member : union.userSpecifiedMemberTypes()) {
            TypeDescKind kind = CommonUtils.getRawType(member).typeKind();
            if (kind != TypeDescKind.NIL && kind != TypeDescKind.ERROR) {
                members.add(member);
            }
        }
        return members;
    }

    private static boolean admitsNil(UnionTypeSymbol union) {
        return union.userSpecifiedMemberTypes().stream()
                .anyMatch(member -> CommonUtils.getRawType(member).typeKind() == TypeDescKind.NIL);
    }

    private static String withoutNonNull(String type) {
        return type.endsWith(NON_NULL) ? type.substring(0, type.length() - 1) : type;
    }

    private static String toNamedType(TypeSymbol type, boolean isId) {
        return switch (type.typeKind()) {
            case TYPE_REFERENCE -> type.getName().orElse(type.signature());
            case ARRAY -> "[" + toSdl(((ArrayTypeSymbol) type).memberTypeDescriptor(), isId) + "]";
            case TABLE -> "[" + toSdl(((TableTypeSymbol) type).rowTypeParameter(), isId) + "]";
            case INTERSECTION -> toNamedType(((IntersectionTypeSymbol) type).effectiveTypeDescriptor(), isId);
            default -> {
                String scalar = toScalar(type, isId);
                yield scalar != null ? scalar : type.signature();
            }
        };
    }

    private static String toScalar(TypeSymbol type, boolean isId) {
        String scalar = switch (type.typeKind()) {
            case STRING, STRING_CHAR -> "String";
            case INT, INT_SIGNED8, INT_SIGNED16, INT_SIGNED32, INT_UNSIGNED8, INT_UNSIGNED16, INT_UNSIGNED32, BYTE ->
                    "Int";
            case FLOAT -> "Float";
            case DECIMAL -> "Decimal";
            case BOOLEAN -> "Boolean";
            default -> null;
        };
        return scalar != null && isId ? ID_TYPE : scalar;
    }

    private static boolean isGraphqlListener(TypeSymbol type) {
        return isFromGraphqlModule(type) && type.getName().map(LISTENER_TYPE::equals).orElse(false);
    }

    private static boolean isFromGraphqlModule(Symbol symbol) {
        return symbol.getModule().map(ModuleSymbol::id)
                .map(id -> CommonUtils.BALLERINA_ORG_NAME.equals(id.orgName())
                        && GRAPHQL_MODULE.equals(id.moduleName()))
                .orElse(false);
    }
}
