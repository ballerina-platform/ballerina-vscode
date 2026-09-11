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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachPoint;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterKind;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.PathParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.resourcepath.PathSegmentList;
import io.ballerina.compiler.api.symbols.resourcepath.ResourcePath;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.DefaultValueGeneratorUtil;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;
import io.ballerina.projects.Document;
import io.ballerina.projects.Package;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.TextRange;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Semantic-model facts the schema-driven Copilot service loader needs from a trigger library: the listener
 * class and its init parameters, the module's service object types with their declared methods, and the
 * existence checks used to validate {@code trigger-metadata.json} claims against the resolved package.
 *
 * <p>Reads the same compiled package {@code CopilotLibraryManager} already resolves, so no extra package
 * resolution happens. Type signatures use the 3-arg
 * {@link CommonUtils#getTypeSignature(SemanticModel, TypeSymbol, boolean)} overload so the strings fed to
 * {@link TypeResolver} match the historical SQLite forms (module-prefixed, unions exploded member-wise).
 *
 * @since 1.7.0
 */
final class TriggerSemanticFacts {

    private static final String LISTENER = "Listener";

    private final SemanticModel semanticModel;
    private final Package modulePackage;
    private final Map<String, ClassSymbol> classesByName = new LinkedHashMap<>();
    private final Map<String, ObjectTypeSymbol> serviceObjectTypesByName = new LinkedHashMap<>();
    private final Set<String> declaredTypeNames = new HashSet<>();
    private final Set<String> declaredAnnotationNames = new HashSet<>();
    private final Map<String, String> annotationConstraintsByName = new LinkedHashMap<>();
    // The compiler's own attach points per declared annotation, which is what makes an attachment legal
    // rather than what the document claims. See annotationAttachPoints.
    private final Map<String, Set<String>> annotationAttachPointsByName = new LinkedHashMap<>();
    // Every declared type definition, for the record-field lookup the spec's derived fixedFields needs.
    private final Map<String, TypeDefinitionSymbol> typeDefinitionsByName = new LinkedHashMap<>();
    // Lazily built: only a document with a cross-module annotation ever needs it.
    private Map<String, ModuleSymbol> reachableModules;

    TriggerSemanticFacts(SemanticModel semanticModel, Package modulePackage) {
        this.semanticModel = semanticModel;
        this.modulePackage = modulePackage;
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            String name = symbol.getName().orElse(null);
            if (name == null) {
                continue;
            }
            switch (symbol.kind()) {
                case CLASS, TYPE_DEFINITION, ENUM, CONSTANT, ENUM_MEMBER -> declaredTypeNames.add(name);
                default -> {
                }
            }
            if (symbol instanceof AnnotationSymbol annotationSymbol) {
                declaredAnnotationNames.add(name);
                annotationSymbol.typeDescriptor().ifPresent(constraint -> annotationConstraintsByName
                        .putIfAbsent(name, CommonUtils.getTypeSignature(semanticModel, constraint, false)));
                annotationAttachPointsByName.putIfAbsent(name, attachPointNames(annotationSymbol));
            }
            if (symbol instanceof ClassSymbol classSymbol) {
                // PUBLIC only, matching SymbolProcessor's filter at every tier: a non-public class cannot
                // be instantiated from a user's module, so selecting one would emit
                // `on new x:Listener(...)` against a symbol the generated code cannot see.
                //
                // Deliberately NOT applied to declaredTypeNames or serviceObjectTypesByName below: those
                // ask what the package declares, not what a user's module can reference, and narrowing them
                // would newly veto handlers over types that do exist.
                if (classSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
                    classesByName.putIfAbsent(name, classSymbol);
                }
            } else if (symbol instanceof TypeDefinitionSymbol typeDef) {
                typeDefinitionsByName.putIfAbsent(name, typeDef);
                TypeSymbol raw = CommonUtils.getRawType(typeDef.typeDescriptor());
                if (raw instanceof ObjectTypeSymbol objectType
                        && objectType.qualifiers().contains(Qualifier.SERVICE)) {
                    serviceObjectTypesByName.putIfAbsent(name, objectType);
                }
            }
        }
    }

    /**
     * Whether the module declares a named type-ish symbol (class, type definition, enum, constant) with
     * this exact name — the criterion for alias-prefixing a metadata type name so {@link TypeResolver}
     * strips it back off and links it.
     */
    boolean declaresType(String name) {
        return declaredTypeNames.contains(name);
    }

    /**
     * Whether the module declares an <b>annotation</b> of this exact name — the tag written after
     * {@code @}, which is what a metadata document's {@code annotations[].type.name} names.
     *
     * <p>Kept separate from {@link #declaresType(String)} because the two namespaces are separate: an
     * annotation tag and a type of the same name can coexist, and in this corpus they systematically differ
     * ({@code ballerina/ftp} declares the tag {@code ServiceConfig} constrained by the record
     * {@code ServiceConfiguration}).
     */
    boolean declaresAnnotation(String name) {
        return declaredAnnotationNames.contains(name);
    }

    /**
     * The type constraining a declared annotation — the record whose fields an attachment supplies, as a
     * module-prefixed signature ({@code "ftp:ServiceConfiguration"}).
     *
     * <p>Read from the compiler rather than the document, since the spec's {@code type} names the annotation
     * and not its constraint. Empty for a marker annotation that declares no type, and for any annotation
     * this module does not declare.
     */
    Optional<String> annotationConstraint(String name) {
        return Optional.ofNullable(annotationConstraintsByName.get(name));
    }

    /**
     * The attach points the resolved package <b>declares</b> for an annotation, as
     * {@link AnnotationAttachPoint} constant names.
     *
     * <p>Read from the compiler rather than from the document's {@code attachPoint}: the two can disagree,
     * and the compiler is the one that rejects the result. The spec's {@code attachPoint} states intent;
     * this states what the package will accept.
     *
     * @param name the annotation's name, e.g. {@code "FunctionConfig"}
     * @return the declared points, or empty when this module declares no such annotation
     */
    Set<String> annotationAttachPoints(String name) {
        return annotationAttachPointsByName.getOrDefault(name, Set.of());
    }

    /**
     * {@link #annotationAttachPoints} for an annotation declared by a module this one depends on, reached
     * the same way {@link #foreignAnnotationConstraint} reaches its constraint.
     *
     * @param orgModule      the foreign coordinate, e.g. {@code "ballerinax/cdc"}
     * @param annotationName the annotation's name
     * @return the declared points, or empty when the module is unreachable or declares no such annotation
     */
    Set<String> foreignAnnotationAttachPoints(String orgModule, String annotationName) {
        if (orgModule == null || annotationName == null || annotationName.isEmpty()) {
            return Set.of();
        }
        ModuleSymbol module = reachableModules().get(orgModule);
        if (module == null) {
            return Set.of();
        }
        for (Symbol symbol : module.allSymbols()) {
            if (symbol instanceof AnnotationSymbol annotationSymbol
                    && annotationName.equals(symbol.getName().orElse(null))) {
                return attachPointNames(annotationSymbol);
            }
        }
        return Set.of();
    }

    private static Set<String> attachPointNames(AnnotationSymbol annotationSymbol) {
        Set<String> points = new LinkedHashSet<>();
        for (AnnotationAttachPoint point : annotationSymbol.attachPoints()) {
            points.add(point.name());
        }
        return points;
    }

    /**
     * The field names a declared record type has, in declaration order — the input the spec's derived
     * {@code fixedFields} is computed from ("the envelope's fields minus {@code bindableFields}").
     *
     * <p>Read here rather than through {@code TriggerLibraryIntrospector}, which exposes expanded fields
     * only for annotations, listener init parameters and service-type function parameters — a data-binding
     * envelope is none of those.
     *
     * @param typeName the record type's bare name, e.g. {@code "AnydataConsumerRecord"}
     * @return its field names in declaration order, or empty when the name is not a declared record
     */
    List<String> recordFieldNames(String typeName) {
        TypeDefinitionSymbol typeDef = typeName == null ? null : typeDefinitionsByName.get(typeName);
        if (typeDef == null) {
            return List.of();
        }
        TypeSymbol raw = CommonUtils.getRawType(typeDef.typeDescriptor());
        if (!(raw instanceof RecordTypeSymbol recordType)) {
            return List.of();
        }
        List<String> names = new ArrayList<>();
        for (Map.Entry<String, RecordFieldSymbol> entry : recordType.fieldDescriptors().entrySet()) {
            names.add(entry.getValue().getName().orElse(entry.getKey()));
        }
        return names;
    }

    /**
     * The type constraining an annotation declared by a <b>different</b> module that this one depends on,
     * e.g. {@code ballerinax/cdc}'s {@code ServiceConfig} seen from {@code ballerinax/mssql}.
     *
     * <p>No second package resolution happens: such a module is necessarily a dependency, so its symbols
     * are already inside this compilation and are reached through its {@link ModuleSymbol}. The module is
     * addressed by the {@code org/module} coordinate the metadata document states, so nothing here is
     * specific to any connector.
     *
     * @param orgModule      the foreign coordinate, e.g. {@code "ballerinax/cdc"}
     * @param annotationName the annotation's name, e.g. {@code "ServiceConfig"}
     * @return the constraining type's module-prefixed signature ({@code "cdc:CdcServiceConfig"}), or empty
     *         when the module is not reachable, declares no such annotation, or the annotation is a marker
     */
    Optional<String> foreignAnnotationConstraint(String orgModule, String annotationName) {
        if (orgModule == null || annotationName == null || annotationName.isEmpty()) {
            return Optional.empty();
        }
        ModuleSymbol module = reachableModules().get(orgModule);
        if (module == null) {
            return Optional.empty();
        }
        for (Symbol symbol : module.allSymbols()) {
            if (symbol instanceof AnnotationSymbol annotationSymbol
                    && annotationName.equals(symbol.getName().orElse(null))) {
                return annotationSymbol.typeDescriptor()
                        .map(constraint -> CommonUtils.getTypeSignature(semanticModel, constraint, false));
            }
        }
        return Optional.empty();
    }

    /**
     * Every module reachable from this one's own symbols, keyed by {@code org/module}.
     *
     * <p>Built lazily and once, since only a document declaring a cross-module annotation ever asks.
     * Dependencies are discovered through the type references this module makes — a type inclusion, a
     * method parameter, a return type — because a reference proves the symbols are genuinely loaded in this
     * compilation.
     */
    private Map<String, ModuleSymbol> reachableModules() {
        if (reachableModules != null) {
            return reachableModules;
        }
        Map<String, ModuleSymbol> modules = new LinkedHashMap<>();
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            record(modules, symbol.getModule());
            if (!(symbol instanceof ClassSymbol classSymbol)) {
                continue;
            }
            for (TypeSymbol inclusion : classSymbol.typeInclusions()) {
                record(modules, inclusion.getModule());
            }
            for (MethodSymbol method : classSymbol.methods().values()) {
                method.typeDescriptor().params().ifPresent(params -> {
                    for (ParameterSymbol param : params) {
                        record(modules, param.typeDescriptor().getModule());
                    }
                });
                method.typeDescriptor().returnTypeDescriptor()
                        .ifPresent(returnType -> record(modules, returnType.getModule()));
            }
        }
        reachableModules = modules;
        return reachableModules;
    }

    private static void record(Map<String, ModuleSymbol> into, Optional<ModuleSymbol> module) {
        module.ifPresent(m -> into.putIfAbsent(m.id().orgName() + "/" + m.id().moduleName(), m));
    }

    Optional<ObjectTypeSymbol> serviceObjectType(String name) {
        return Optional.ofNullable(serviceObjectTypesByName.get(name));
    }

    /**
     * Resolves the listener class: the metadata-declared name when the package actually declares it, else
     * the canonical {@code Listener} class, else the first class that type-includes a {@code Listener} (the
     * {@code CdcListener} pattern).
     *
     * <p><b>Bounded to the package's default module</b>, the one semantic model
     * {@code CopilotLibraryManager} compiles. A connector declaring its listener in a submodule does not
     * resolve here, and its service types are dropped with a logged reason by
     * {@link ListenerPairingResolver} rather than silently. No corpus connector does this.
     */
    Optional<ClassSymbol> resolveListenerClass(String metadataDeclaredName) {
        if (metadataDeclaredName != null && classesByName.containsKey(metadataDeclaredName)) {
            return Optional.of(classesByName.get(metadataDeclaredName));
        }
        if (classesByName.containsKey(LISTENER)) {
            return Optional.of(classesByName.get(LISTENER));
        }
        for (ClassSymbol classSymbol : classesByName.values()) {
            boolean includesListener = classSymbol.typeInclusions().stream()
                    .filter(t -> t instanceof TypeReferenceTypeSymbol)
                    .map(t -> (TypeReferenceTypeSymbol) t)
                    .anyMatch(ref -> ref.definition().nameEquals(LISTENER));
            if (includesListener) {
                return Optional.of(classSymbol);
            }
        }
        return Optional.empty();
    }

    /**
     * One top-level listener init parameter, with everything the Copilot listener spec needs.
     *
     * @param name          the parameter name
     * @param typeSignature the module-prefixed type signature (3-arg {@code getTypeSignature} form)
     * @param description   the parameter documentation from the init method's {@code parameterMap()}
     * @param optional      whether the parameter is defaultable/included-record (optional to supply)
     * @param defaultValue  the declared or type-derived default expression text
     */
    record InitParam(String name, String typeSignature, String description, boolean optional,
                     String defaultValue) {
    }

    /**
     * The listener's top-level init parameters: {@code REQUIRED}, {@code DEFAULTABLE},
     * {@code INCLUDED_RECORD} and rest parameters, in declaration order — the same set the
     * service-index stored under those kinds (never the flattened {@code INCLUDED_FIELD} rows).
     */
    List<InitParam> listenerInitParams(ClassSymbol listenerClass) {
        Optional<MethodSymbol> initOpt = listenerClass.initMethod();
        if (initOpt.isEmpty()) {
            return List.of();
        }
        MethodSymbol init = initOpt.get();
        Map<String, String> paramDocs = init.documentation()
                .map(Documentation::parameterMap)
                .orElse(Collections.emptyMap());

        List<InitParam> result = new ArrayList<>();
        init.typeDescriptor().params().ifPresent(params -> {
            for (ParameterSymbol param : params) {
                result.add(toInitParam(param, paramDocs));
            }
        });
        init.typeDescriptor().restParam().ifPresent(rest -> result.add(toInitParam(rest, paramDocs)));
        return result;
    }

    private InitParam toInitParam(ParameterSymbol param, Map<String, String> paramDocs) {
        String name = param.getName().orElse("");
        TypeSymbol typeSymbol = param.typeDescriptor();
        String typeSignature = CommonUtils.getTypeSignature(semanticModel, typeSymbol, false);
        boolean optional = param.paramKind() == ParameterKind.DEFAULTABLE
                || param.paramKind() == ParameterKind.INCLUDED_RECORD;

        String defaultValue = DefaultValueGeneratorUtil.getDefaultValueForType(typeSymbol);
        if (param.paramKind() == ParameterKind.DEFAULTABLE) {
            String declared = declaredDefaultValue(param);
            if (declared != null) {
                defaultValue = declared;
            }
        }
        return new InitParam(name, typeSignature, paramDocs.getOrDefault(name, ""), optional, defaultValue);
    }

    /**
     * Recovers a defaultable parameter's declared default expression from the package's syntax tree —
     * the same technique the service-index generator used, so values like
     * {@code { webhookSecret: DEFAULT_SECRET }} or {@code 8090} come through verbatim.
     */
    private String declaredDefaultValue(ParameterSymbol param) {
        Optional<Location> location = param.getLocation();
        if (location.isEmpty() || modulePackage == null) {
            return null;
        }
        // CommonUtils owns the package-relative document lookup, including the `modules/<pkg>/<file>`
        // layout and the guard for a path the project does not know.
        Document document = CommonUtils.findDocument(modulePackage,
                location.get().lineRange().fileName());
        if (document == null) {
            return null;
        }
        try {
            ModulePartNode rootNode = document.syntaxTree().rootNode();
            NonTerminalNode node = rootNode.findNode(TextRange.from(
                    location.get().textRange().startOffset(), location.get().textRange().length()));
            if (node.kind() != SyntaxKind.DEFAULTABLE_PARAM) {
                return null;
            }
            ExpressionNode expression = (ExpressionNode) ((DefaultableParameterNode) node).expression();
            // The spec's alias rule -- a module's last dot-segment -- has one implementation, in commons.
            String alias = TypeRefResolver.moduleAlias(modulePackage.packageName().value());
            if (expression instanceof SimpleNameReferenceNode simpleRef) {
                return alias + ":" + simpleRef.name().text();
            }
            if (expression instanceof QualifiedNameReferenceNode qualifiedRef) {
                return qualifiedRef.modulePrefix().text() + ":" + qualifiedRef.identifier().text();
            }
            return expression.toSourceCode();
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * One declared method of a concrete service object type.
     *
     * @param name                the method name (resource methods: the resource path)
     * @param kind                {@code "remote"} or {@code "resource"}
     * @param description         the method's doc-comment description
     * @param params              the method's parameters, in declaration order
     * @param returnTypeSignature the module-prefixed return type signature
     * @param isolatedQualifier   whether the declaration carries {@code isolated}. An implementation that
     *                            omits it does not compile: the compiler reports "mismatched function
     *                            signatures" with an <i>identical</i>-looking expected and found pair,
     *                            because it prints neither qualifier
     */
    record DeclaredMethod(String name, String kind, String description, List<DeclaredParam> params,
                          String returnTypeSignature, boolean isolatedQualifier) {
    }

    /**
     * One parameter of a {@link DeclaredMethod}.
     *
     * @param name          the parameter name
     * @param typeSignature the module-prefixed type signature
     * @param description   the parameter documentation from the method's {@code parameterMap()}
     * @param optional      whether the parameter is defaultable
     */
    record DeclaredParam(String name, String typeSignature, String description, boolean optional) {
    }

    /**
     * The remote/resource methods a concrete service object type declares, in declaration order.
     * Resource methods are named by their path (the service-index convention) and their accessor is
     * not carried — matching what the Copilot serves today.
     */
    List<DeclaredMethod> declaredMethods(ObjectTypeSymbol objectType) {
        List<DeclaredMethod> methods = new ArrayList<>();
        for (Map.Entry<String, MethodSymbol> entry : objectType.methods().entrySet()) {
            MethodSymbol method = entry.getValue();
            boolean remote = method.qualifiers().contains(Qualifier.REMOTE);
            boolean resource = method.qualifiers().contains(Qualifier.RESOURCE);
            if (!remote && !resource) {
                continue;
            }

            String name = method.getName().orElse(entry.getKey());
            if (resource && method instanceof ResourceMethodSymbol resourceMethod) {
                name = resourcePath(resourceMethod);
            }

            Optional<Documentation> documentation = method.documentation();
            String description = documentation.flatMap(Documentation::description).orElse("");
            Map<String, String> paramDocs = documentation.map(Documentation::parameterMap)
                    .orElse(Collections.emptyMap());

            List<DeclaredParam> params = new ArrayList<>();
            method.typeDescriptor().params().ifPresent(list -> {
                for (int i = 0; i < list.size(); i++) {
                    ParameterSymbol param = list.get(i);
                    // A declared method parameter always carries a name; the positional fallback is
                    // defensive only, and is indexed so two of them could never collide.
                    String paramName = param.getName().orElse("param" + (i + 1));
                    params.add(new DeclaredParam(
                            paramName,
                            CommonUtils.getTypeSignature(semanticModel, param.typeDescriptor(), false),
                            paramDocs.getOrDefault(paramName, ""),
                            param.paramKind() == ParameterKind.DEFAULTABLE));
                }
            });

            String returnSignature = method.typeDescriptor().returnTypeDescriptor()
                    .map(ret -> CommonUtils.getTypeSignature(semanticModel, ret, false))
                    .orElse("");
            methods.add(new DeclaredMethod(name, resource ? "resource" : "remote", description, params,
                    returnSignature, method.qualifiers().contains(Qualifier.ISOLATED)));
        }
        return methods;
    }

    /** Renders a resource method's path the way the service-index generator named its rows. */
    private String resourcePath(ResourceMethodSymbol resourceMethod) {
        ResourcePath resourcePath = resourceMethod.resourcePath();
        List<String> paths = new ArrayList<>();
        switch (resourcePath.kind()) {
            case PATH_SEGMENT_LIST -> {
                for (Symbol pathSegment : ((PathSegmentList) resourcePath).list()) {
                    if (pathSegment instanceof PathParameterSymbol pathParam) {
                        String type = CommonUtils.getTypeSignature(semanticModel,
                                pathParam.typeDescriptor(), true);
                        paths.add("[%s %s]".formatted(type, pathParam.getName().orElse("")));
                    } else {
                        paths.add(pathSegment.getName().orElse(""));
                    }
                }
            }
            case DOT_RESOURCE_PATH -> paths.add(".");
            default -> paths.add("");
        }
        return String.join("/", paths);
    }
}
