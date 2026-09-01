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

package io.ballerina.modelgenerator.commons.trigger.utils;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentable;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterKind;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerLibraryFacts;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Resolves the {@link TriggerLibraryFacts} a {@code TriggerUISchemaModel} synthesizer needs from a
 * connector's compiled {@link SemanticModel}: listener init-parameter structure, service object types
 * (with their remote/resource functions), and declared annotations.
 *
 * <p>Listener param facts are resolved for structure only; a synthesizer still resolves each
 * parameter's rendered widget via {@code ListenerUtil#getListenerModelByName}.
 *
 * @since 1.10.0
 */
public final class TriggerLibraryIntrospector {

    private static final String LISTENER = "Listener";
    private static final int MAX_FIELD_DEPTH = 4;

    private TriggerLibraryIntrospector() {
    }

    /**
     * Resolves every listener (structure only), service type, and annotation declared in
     * {@code semanticModel}'s module.
     *
     * @param moduleInfo type signatures are rendered relative to this module (via
     *                   {@link CommonUtils#getTypeSignature}), so a same-module reference renders as a
     *                   bare name rather than the compiler's fully-qualified form, which is not valid
     *                   Ballerina source
     */
    public static TriggerLibraryFacts introspect(SemanticModel semanticModel, ModuleInfo moduleInfo) {
        List<TriggerLibraryFacts.Listener> listeners = new ArrayList<>();
        List<TriggerLibraryFacts.ServiceType> serviceTypes = new ArrayList<>();
        List<TriggerLibraryFacts.Annotation> annotations = new ArrayList<>();

        for (Symbol symbol : semanticModel.moduleSymbols()) {
            switch (symbol.kind()) {
                case CLASS -> {
                    ClassSymbol classSymbol = (ClassSymbol) symbol;
                    if (isListenerClass(classSymbol)) {
                        classSymbol.initMethod().ifPresent(init ->
                                listeners.add(extractListener(classSymbol, init, moduleInfo)));
                    }
                }
                case TYPE_DEFINITION -> {
                    TypeDefinitionSymbol typeDef = (TypeDefinitionSymbol) symbol;
                    TypeSymbol type = typeDef.typeDescriptor();
                    if (type instanceof ObjectTypeSymbol obj && obj.qualifiers().contains(Qualifier.SERVICE)) {
                        serviceTypes.add(extractServiceType(typeDef.getName().orElse("Service"), typeDef, obj,
                                moduleInfo));
                    }
                }
                case ANNOTATION -> annotations.add(extractAnnotation((AnnotationSymbol) symbol, moduleInfo));
                default -> { }
            }
        }
        return new TriggerLibraryFacts(listeners, serviceTypes, annotations);
    }

    /** A class is a listener if it is named {@code Listener} or type-includes a {@code Listener}. */
    private static boolean isListenerClass(ClassSymbol classSymbol) {
        if (classSymbol.nameEquals(LISTENER)) {
            return true;
        }
        return classSymbol.typeInclusions().stream()
                .anyMatch(t -> t.getName().map(LISTENER::equals).orElse(false));
    }

    private static TriggerLibraryFacts.Listener extractListener(ClassSymbol classSymbol, MethodSymbol init,
                                                                 ModuleInfo moduleInfo) {
        String type = classSymbol.getName().orElse(LISTENER);
        List<TriggerLibraryFacts.Param> params = new ArrayList<>();
        init.typeDescriptor().params().ifPresent(ps -> ps.forEach(p -> params.add(toParam(p, moduleInfo))));
        return new TriggerLibraryFacts.Listener(type, params);
    }

    private static TriggerLibraryFacts.Param toParam(ParameterSymbol p, ModuleInfo moduleInfo) {
        String name = p.getName().orElse("");
        TypeSymbol type = p.typeDescriptor();
        String kind = mapParamKind(p.paramKind());
        boolean optional = p.paramKind() == ParameterKind.DEFAULTABLE
                || p.paramKind() == ParameterKind.INCLUDED_RECORD;
        List<TriggerLibraryFacts.Param> fields = recordFields(type, 0, moduleInfo);
        return new TriggerLibraryFacts.Param(name, CommonUtils.getTypeSignature(type, moduleInfo), optional, kind,
                doc(p), fields, type);
    }

    /**
     * Expands the fields of a record type (recursively, depth-capped). A union of record types is
     * expanded by merging every member's fields -- first occurrence wins on name clashes.
     */
    private static List<TriggerLibraryFacts.Param> recordFields(TypeSymbol type, int depth, ModuleInfo moduleInfo) {
        if (depth >= MAX_FIELD_DEPTH) {
            return List.of();
        }
        TypeSymbol t = type;
        if (t instanceof TypeReferenceTypeSymbol ref) {
            t = ref.typeDescriptor();
        }
        if (t instanceof UnionTypeSymbol union) {
            List<TriggerLibraryFacts.Param> merged = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (TypeSymbol member : union.memberTypeDescriptors()) {
                for (TriggerLibraryFacts.Param f : recordFields(member, depth, moduleInfo)) {
                    if (seen.add(f.name())) {
                        merged.add(f);
                    }
                }
            }
            return merged;
        }
        if (!(t instanceof RecordTypeSymbol rec)) {
            return List.of();
        }
        List<TriggerLibraryFacts.Param> fields = new ArrayList<>();
        for (Map.Entry<String, RecordFieldSymbol> e : rec.fieldDescriptors().entrySet()) {
            RecordFieldSymbol f = e.getValue();
            fields.add(new TriggerLibraryFacts.Param(e.getKey(),
                    CommonUtils.getTypeSignature(f.typeDescriptor(), moduleInfo),
                    f.isOptional() || f.hasDefaultValue(), "RECORD_FIELD", doc(f),
                    recordFields(f.typeDescriptor(), depth + 1, moduleInfo), f.typeDescriptor()));
        }
        return fields;
    }

    private static String mapParamKind(ParameterKind kind) {
        return switch (kind) {
            case REQUIRED -> "REQUIRED";
            case DEFAULTABLE -> "DEFAULTABLE";
            case INCLUDED_RECORD -> "INCLUDED_RECORD";
            case REST -> "REST";
            default -> kind.name();
        };
    }

    private static TriggerLibraryFacts.ServiceType extractServiceType(String name, TypeDefinitionSymbol typeDef,
                                                                       ObjectTypeSymbol obj, ModuleInfo moduleInfo) {
        List<TriggerLibraryFacts.Function> functions = new ArrayList<>();
        for (Map.Entry<String, MethodSymbol> e : obj.methods().entrySet()) {
            MethodSymbol m = e.getValue();
            boolean remote = m.qualifiers().contains(Qualifier.REMOTE);
            boolean resource = m.qualifiers().contains(Qualifier.RESOURCE);
            if (!remote && !resource) {
                continue;
            }
            functions.add(extractFunction(e.getKey(), m, remote ? "REMOTE" : "RESOURCE", moduleInfo));
        }
        return new TriggerLibraryFacts.ServiceType(name, doc(typeDef), functions);
    }

    private static TriggerLibraryFacts.Function extractFunction(String name, MethodSymbol m, String kind,
                                                                 ModuleInfo moduleInfo) {
        FunctionTypeSymbol fn = m.typeDescriptor();
        List<TriggerLibraryFacts.Param> params = new ArrayList<>();
        fn.params().ifPresent(ps -> ps.forEach(p -> params.add(toParam(p, moduleInfo))));
        Optional<TypeSymbol> ret = fn.returnTypeDescriptor();
        String returnType = ret.map(r -> CommonUtils.getTypeSignature(r, moduleInfo)).orElse(null);
        boolean returnsError = ret.map(r -> r.signature().contains("error")).orElse(false);
        List<String> quals = new ArrayList<>();
        m.qualifiers().forEach(q -> quals.add(q.getValue()));
        return new TriggerLibraryFacts.Function(name, quals, kind, returnType, returnsError, doc(m), params);
    }

    private static TriggerLibraryFacts.Annotation extractAnnotation(AnnotationSymbol a, ModuleInfo moduleInfo) {
        Optional<TypeSymbol> typeDescriptor = a.typeDescriptor();
        String typeConstraint = typeDescriptor.map(t -> CommonUtils.getTypeSignature(t, moduleInfo)).orElse(null);
        List<TriggerLibraryFacts.Param> fields = typeDescriptor.map(t -> recordFields(t, 0, moduleInfo))
                .orElse(List.of());
        List<String> points = new ArrayList<>();
        a.attachPoints().forEach(p -> points.add(p.name()));
        String module = a.getModule().map(m -> m.id().moduleName()).orElse("");
        return new TriggerLibraryFacts.Annotation(a.getName().orElse(""), module, typeConstraint, points, doc(a),
                fields);
    }

    private static String doc(Symbol s) {
        if (s instanceof Documentable d) {
            return d.documentation().flatMap(Documentation::description).orElse("");
        }
        return "";
    }
}
