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

import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.PathParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.ServiceDeclarationSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.resourcepath.PathSegmentList;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    private static final String GET_ACCESSOR = "get";
    private static final String SUBSCRIBE_ACCESSOR = "subscribe";
    // A code point escape in an identifier, e.g. `first\\u{2D}name`.
    private static final Pattern UNICODE_ESCAPE = Pattern.compile("\\\\u\\{([0-9a-fA-F]+)}");

    private GraphqlTypeMapper() {
    }

    /**
     * Returns whether the service is attached to a {@code graphql:Listener}.
     */
    public static boolean isGraphqlService(ServiceDeclarationSymbol serviceSymbol) {
        return serviceSymbol.listenerTypes().stream().anyMatch(GraphqlTypeMapper::isGraphqlListener);
    }

    /**
     * Returns the name of the GraphQL field a service method defines, or {@code null} if it defines none: a
     * {@code get} or {@code subscribe} resource with a single-segment path, or a remote method. A hierarchical
     * resource path (e.g. {@code get account/name}) contributes to a nested type rather than a field of its own, and
     * any other method (an {@code init}, a helper) is not part of the schema.
     */
    public static String fieldName(MethodSymbol method) {
        if (method instanceof ResourceMethodSymbol resource) {
            String accessor = resource.getName().orElse("");
            if (!GET_ACCESSOR.equals(accessor) && !isSubscriptionAccessor(accessor)) {
                return null;
            }
            if (!(resource.resourcePath() instanceof PathSegmentList path) || path.list().size() != 1
                    || path.pathRestParameter().isPresent() || path.list().get(0) instanceof PathParameterSymbol) {
                return null;
            }
            return path.list().get(0).getName().map(GraphqlTypeMapper::unescape).orElse(null);
        }
        return method.qualifiers().contains(Qualifier.REMOTE) ? method.getName().map(GraphqlTypeMapper::unescape)
                .orElse(null) : null;
    }

    /**
     * Returns the type of the field a method defines: its return type, or for a subscription the element type of the
     * stream it returns. {@code null} if the method has no return type.
     */
    public static String toFieldTypeSdl(MethodSymbol method) {
        FunctionTypeSymbol functionType = method.typeDescriptor();
        boolean isId = functionType.returnTypeAnnotations()
                .map(annotations -> hasIdAnnotation(annotations.annotAttachments()))
                .orElse(false);
        boolean isSubscription = method instanceof ResourceMethodSymbol
                && isSubscriptionAccessor(method.getName().orElse(""));
        return functionType.returnTypeDescriptor()
                .map(returnType -> toSdl(isSubscription ? unwrapStream(returnType) : returnType, isId))
                .orElse(null);
    }

    /**
     * Returns the type of the argument a parameter defines, or {@code null} for a runtime-injected parameter, which
     * is not a schema argument.
     */
    public static String toArgumentSdl(ParameterSymbol param) {
        if (isInjectedParam(param.typeDescriptor())) {
            return null;
        }
        return toSdl(param.typeDescriptor(), hasIdAnnotation(param.annotAttachments()));
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
        return toSdl(typeSymbol, isId, new HashSet<>());
    }

    /**
     * @param expanding the aliases being expanded, so a recursive alias (e.g. {@code type Tree Tree[]?}) is shown by
     *                  name where it refers to itself instead of being expanded forever
     */
    private static String toSdl(TypeSymbol typeSymbol, boolean isId, Set<String> expanding) {
        // An alias that is not a schema type of its own (e.g. `type Books Book[]`, `type MaybeBook Book?`) shows its
        // list shape and nullability, as if written inline.
        if (typeSymbol instanceof TypeReferenceTypeSymbol reference && !isSchemaType(reference)) {
            String alias = reference.signature();
            if (!expanding.add(alias)) {
                return toNamedType(reference, isId, expanding) + NON_NULL;
            }
            String type = toSdl(reference.typeDescriptor(), isId, expanding);
            expanding.remove(alias);
            return type;
        }
        if (typeSymbol instanceof IntersectionTypeSymbol intersection) {
            TypeSymbol shape = withoutReadonly(intersection);
            if (shape != intersection) {
                return toSdl(shape, isId, expanding);
            }
        }
        if (typeSymbol instanceof UnionTypeSymbol union) {
            List<TypeSymbol> members = valueMembers(union);
            boolean nullable = admitsNil(union);
            if (members.size() == 1) {
                String member = toSdl(members.get(0), isId, expanding);
                return nullable ? withoutNonNull(member) : member;
            }
            // An anonymous union has no SDL name of its own (and the schema generator rejects one that mixes scalars
            // and objects), so show its members, each in GraphQL terms, grouped so the `!` reads as applying to all.
            String memberList = String.join("|", members.stream()
                    .map(member -> withoutNonNull(toSdl(member, isId, expanding))).toList());
            return nullable ? "(" + memberList + ")" : "(" + memberList + ")" + NON_NULL;
        }
        // A schema type named by a reference can still admit nil (e.g. `type Search Book|Author|()`).
        String namedType = toNamedType(typeSymbol, isId, expanding);
        return admitsNil(typeSymbol) ? namedType : namedType + NON_NULL;
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
     * Returns the default value of each argument in a signature as written, keyed by GraphQL argument name. A default
     * makes the argument optional to pass even when its type is non-null (e.g. {@code name: String! = ""}). A nil
     * default is left out: it only makes the argument optional, which its nullable type already says.
     */
    public static Map<String, String> getDefaultValues(FunctionSignatureNode signature) {
        Map<String, String> defaults = new HashMap<>();
        for (ParameterNode param : signature.parameters()) {
            if (param instanceof DefaultableParameterNode defaultable && defaultable.paramName().isPresent()) {
                // A diagram row shows the default on one line, so a literal spread over several lines is joined.
                String value = defaultable.expression().toSourceCode().trim().replaceAll("\\s*\\R\\s*", " ");
                if (!NIL_DEFAULT.equals(value)) {
                    defaults.put(unescape(defaultable.paramName().get().text().trim()), value);
                }
            }
        }
        return defaults;
    }

    /**
     * {@code graphql:Context} and {@code graphql:Field} parameters are injected by the runtime, not schema arguments.
     */
    public static boolean isInjectedParam(TypeSymbol type) {
        return type.typeKind() == TypeDescKind.TYPE_REFERENCE && isFromGraphqlModule(type)
                && type.getName().map(INJECTED_PARAM_TYPES::contains).orElse(false);
    }

    /**
     * GraphQL names are the unescaped Ballerina identifiers, e.g. {@code 'type} is exposed as {@code type}. Unicode
     * code point escapes are decoded as well.
     */
    public static String unescape(String identifier) {
        String name = identifier.startsWith("'") ? identifier.substring(1) : identifier;
        String decoded = UNICODE_ESCAPE.matcher(name).replaceAll(match -> Matcher.quoteReplacement(
                Character.toString(Integer.parseInt(match.group(1), 16))));
        return decoded.replaceAll("\\\\(.)", "$1");
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

    /**
     * Whether a type admits nil, looking through aliases: in {@code MaybeBook|Author} with {@code type MaybeBook
     * Book?}, the nil comes from the alias, so the members as written do not show it. memberTypeDescriptors()
     * flattens a referenced union into its members, which is what brings that nil up.
     */
    private static boolean admitsNil(TypeSymbol type) {
        TypeSymbol rawType = CommonUtils.getRawType(type);
        if (rawType instanceof UnionTypeSymbol union) {
            return union.memberTypeDescriptors().stream()
                    .anyMatch(member -> CommonUtils.getRawType(member).typeKind() == TypeDescKind.NIL);
        }
        return rawType.typeKind() == TypeDescKind.NIL;
    }

    private static String withoutNonNull(String type) {
        return type.endsWith(NON_NULL) ? type.substring(0, type.length() - 1) : type;
    }

    private static String toNamedType(TypeSymbol type, boolean isId, Set<String> expanding) {
        return switch (type.typeKind()) {
            case TYPE_REFERENCE -> type.getName().orElse(type.signature());
            case ARRAY -> "[" + toSdl(((ArrayTypeSymbol) type).memberTypeDescriptor(), isId, expanding) + "]";
            case TABLE -> "[" + toSdl(((TableTypeSymbol) type).rowTypeParameter(), isId, expanding) + "]";
            case INTERSECTION ->
                    toNamedType(((IntersectionTypeSymbol) type).effectiveTypeDescriptor(), isId, expanding);
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

    private static boolean hasIdAnnotation(List<AnnotationAttachmentSymbol> annotations) {
        return annotations.stream().map(AnnotationAttachmentSymbol::typeDescriptor)
                .anyMatch(annotation -> isFromGraphqlModule(annotation)
                        && annotation.getName().map(ID_TYPE::equals).orElse(false));
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
