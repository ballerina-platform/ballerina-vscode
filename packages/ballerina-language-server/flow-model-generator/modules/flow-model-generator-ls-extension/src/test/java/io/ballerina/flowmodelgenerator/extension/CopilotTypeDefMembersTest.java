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

package io.ballerina.flowmodelgenerator.extension;

import io.ballerina.flowmodelgenerator.core.copilot.CopilotLibraryManager;
import io.ballerina.flowmodelgenerator.core.copilot.model.Library;
import io.ballerina.flowmodelgenerator.core.copilot.model.LibraryFunction;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeDef;
import io.ballerina.flowmodelgenerator.core.copilot.model.UnionValue;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Verifies that a type definition reaches Copilot carrying its members.
 *
 * <p>Two declaration forms produce a class-shaped definition and each used to lose its methods for a
 * different reason:
 * <ul>
 *   <li>{@code public class C { ... }} is a {@code ClassSymbol}; its methods were extracted but the
 *       definition carried no category, so the renderer discarded the whole entry;</li>
 *   <li>{@code public type C object { ... }} is a {@code TypeDefinitionSymbol}; it carried a
 *       category but its methods were never extracted, so it rendered as an empty body.</li>
 * </ul>
 *
 * <p>These resolve real packages from Ballerina Central, so they require the packages to be
 * resolvable (local bala cache or network).
 *
 * @since 1.7.0
 */
public class CopilotTypeDefMembersTest {

    private static final String CLASS_CATEGORY = "Class";

    @Test
    public void testClassDefinitionCarriesCategoryAndMethods() {
        // sql:ResultIterator is `public class ResultIterator { ... }`.
        TypeDef resultIterator = typeDefNamed(loadOne("ballerina/sql"), "ResultIterator");
        Assert.assertEquals(resultIterator.getType(), CLASS_CATEGORY,
                "A class definition must carry a category, else the renderer drops the whole entry");
        Assert.assertNotNull(resultIterator.getFunctions(), "Class methods must be present");
        assertHasFunction(resultIterator, "next");
        assertHasFunction(resultIterator, "close");
    }

    @Test
    public void testObjectTypeDefinitionCarriesItsMethods() {
        // sql:OutParameter is `public type OutParameter object { ... }` with one method.
        TypeDef outParameter = typeDefNamed(loadOne("ballerina/sql"), "OutParameter");
        Assert.assertEquals(outParameter.getType(), CLASS_CATEGORY);
        Assert.assertNotNull(outParameter.getFunctions(),
                "An object type's methods must be extracted, not just its category");
        assertHasFunction(outParameter, "get");
    }

    @Test
    public void testClientQualifiedObjectTypeIsFlagged() {
        // sql:Client is `public type Client isolated client object { ... }` -- an object type, so it
        // is not emitted as a client; it must still render as `client class`.
        TypeDef client = typeDefNamed(loadOne("ballerina/sql"), "Client");
        Assert.assertEquals(client.getType(), CLASS_CATEGORY);
        Assert.assertEquals(client.getClient(), Boolean.TRUE,
                "The client qualifier must survive so the renderer can emit `client class`");
        assertHasFunction(client, "query");
        assertHasFunction(client, "queryRow");
        assertHasFunction(client, "close");
    }

    @Test
    public void testMarkerObjectTypeStaysEmpty() {
        // kafka:Service is `public type Service distinct service object { }` -- genuinely empty, so
        // it must not gain phantom members.
        TypeDef service = typeDefNamed(loadOne("ballerinax/kafka"), "Service");
        Assert.assertEquals(service.getType(), CLASS_CATEGORY);
        Assert.assertTrue(service.getFunctions() == null || service.getFunctions().isEmpty(),
                "A marker service type declares no methods and must stay empty");
        Assert.assertNull(service.getClient(), "A non-client object type must not be flagged");
    }

    @Test
    public void testClassDeclaredClientIsStillEmittedAsAClient() {
        // mysql:Client is `public isolated client class Client { ... }` -- a class, so it belongs in
        // clients, not typeDefs. The object-type path must not have diverted it.
        Library mysql = loadOne("ballerinax/mysql");
        Assert.assertNotNull(mysql.getClients());
        Assert.assertTrue(mysql.getClients().stream().anyMatch(c -> "Client".equals(c.getName())),
                "A client class must remain in clients: " + mysql.getClients());
        Assert.assertTrue(mysql.getTypeDefs().stream().noneMatch(t -> "Client".equals(t.getName())),
                "A client class must not also appear as a type definition");
    }

    @Test
    public void testListenerClassSurvivesWithItsLifecycleApi() {
        // The listener is the central type of a trigger library; it is a class, so it used to be
        // dropped wholesale for want of a category.
        TypeDef listener = typeDefNamed(loadOne("ballerinax/kafka"), "Listener");
        Assert.assertEquals(listener.getType(), CLASS_CATEGORY);
        assertHasFunction(listener, "attach");
        assertHasFunction(listener, "detach");
        assertHasFunction(listener, "gracefulStop");
        assertHasFunction(listener, "immediateStop");
    }

    /**
     * A class that declares no {@code init} cannot be constructed by a caller — it is built inside
     * the module. Emitting one would advertise a public constructor that does not exist, and its
     * "return" would be the class's own type, which no Ballerina {@code init} ever returns.
     */
    @Test
    public void testClassWithoutAnInitDeclaresNoConstructor() {
        // sql:CursorOutParameter declares only `get`; sql:ResultIterator declares a real init.
        TypeDef noInit = typeDefNamed(loadOne("ballerina/sql"), "CursorOutParameter");
        Assert.assertNotNull(noInit.getFunctions());
        Assert.assertTrue(noInit.getFunctions().stream().noneMatch(f -> "init".equals(f.getName())),
                "A class with no declared init must not gain one: "
                        + noInit.getFunctions().stream().map(LibraryFunction::getName).toList());
        assertHasFunction(noInit, "get");

        TypeDef withInit = typeDefNamed(loadOne("ballerina/sql"), "ResultIterator");
        assertHasFunction(withInit, "init");
    }

    /**
     * A declared init's return type must be rendered in Ballerina form, never as the compiler's
     * fully-qualified {@code org/module[:version]:Name}.
     */
    @Test
    public void testInitReturnTypeIsNotFullyQualified() {
        TypeDef resultIterator = typeDefNamed(loadOne("ballerina/sql"), "ResultIterator");
        LibraryFunction init = resultIterator.getFunctions().stream()
                .filter(f -> "init".equals(f.getName())).findFirst().orElseThrow();
        if (init.getReturnInfo() != null && init.getReturnInfo().getType() != null) {
            String returnType = init.getReturnInfo().getType().getName();
            Assert.assertFalse(returnType != null && returnType.matches(".*[A-Za-z0-9_.]+/[A-Za-z0-9_.]+:.*"),
                    "Init return type must not carry an org/module prefix, got: " + returnType);
        }
    }

    /**
     * A composite return type must survive intact. The old reduction cut everything before the last
     * module reference, so {@code stream<rowType, sql:Error?>} arrived as the fragment
     * {@code Error?>}.
     */
    @Test
    public void testCompositeReturnTypeIsNotTruncated() {
        TypeDef client = typeDefNamed(loadOne("ballerina/sql"), "Client");
        LibraryFunction query = client.getFunctions().stream()
                .filter(f -> "query".equals(f.getName())).findFirst().orElseThrow();
        String returnType = query.getReturnInfo().getType().getName();
        Assert.assertEquals(returnType.chars().filter(c -> c == '<').count(),
                returnType.chars().filter(c -> c == '>').count(),
                "Return type must be balanced, got: " + returnType);
        Assert.assertTrue(returnType.startsWith("stream<"),
                "The stream construct must survive, got: " + returnType);
    }

    /**
     * No emitted type name may carry the compiler's {@code org/module[:version]:} prefix — Ballerina
     * source writes an import alias instead.
     */
    @Test
    public void testNoTypeNameCarriesAnOrgModulePrefix() {
        for (String library : new String[]{"ballerina/sql", "ballerina/http", "ballerinax/kafka"}) {
            Library loaded = loadOne(library);
            for (TypeDef typeDef : loaded.getTypeDefs()) {
                assertUnqualified(library, typeDef.getName());
                if (typeDef.getMembers() != null) {
                    typeDef.getMembers().stream()
                            .filter(UnionValue.class::isInstance)
                            .map(UnionValue.class::cast)
                            .forEach(m -> assertUnqualified(library, m.getName()));
                }
                if (typeDef.getFunctions() != null) {
                    for (LibraryFunction function : typeDef.getFunctions()) {
                        if (function.getReturnInfo() != null && function.getReturnInfo().getType() != null) {
                            assertUnqualified(library, function.getReturnInfo().getType().getName());
                        }
                    }
                }
            }
        }
    }

    /**
     * {@code INCLUDED_RECORD_REST} is a form-builder slot whose name is a display label
     * ("Additional Values"); it has no Ballerina syntax and must never reach a signature.
     */
    @Test
    public void testFormBuilderPseudoParameterIsNotEmitted() {
        Library http = loadOne("ballerina/http");
        for (TypeDef typeDef : http.getTypeDefs()) {
            if (typeDef.getFunctions() == null) {
                continue;
            }
            for (LibraryFunction function : typeDef.getFunctions()) {
                if (function.getParameters() == null) {
                    continue;
                }
                function.getParameters().forEach(p -> Assert.assertFalse(
                        p.getName() != null && p.getName().contains(" "),
                        "A parameter name must be an identifier, got: " + p.getName()));
            }
        }
    }

    /**
     * An attachment whose value references a constant or variable carries no {@code ConstantValue},
     * so the value has to be recovered from source. grpc's {@code @protobuf:Descriptor
     * {value: REFLECTION_DESC}} is exactly that case.
     */
    @Test
    public void testAttachmentValueIsRecoveredFromSource() {
        TypeDef extensionRequest = typeDefNamed(loadOne("ballerina/grpc"), "ExtensionRequest");
        Assert.assertNotNull(extensionRequest.getAnnotations(),
                "ExtensionRequest carries @protobuf:Descriptor");
        Assert.assertTrue(extensionRequest.getAnnotations().stream()
                        .anyMatch(a -> "Descriptor".equals(a.getName())
                                && a.getValue() != null && a.getValue().contains("value:")),
                "The declared value must be recovered, got: "
                        + extensionRequest.getAnnotations().stream()
                        .map(a -> a.getName() + "=" + a.getValue()).toList());
    }

    private static void assertUnqualified(String library, String typeName) {
        Assert.assertFalse(typeName != null && typeName.matches(".*[A-Za-z0-9_.]+/[A-Za-z0-9_.]+:.*"),
                library + " emitted a compiler-qualified type name: " + typeName);
    }

    private static void assertHasFunction(TypeDef typeDef, String name) {
        List<LibraryFunction> functions = typeDef.getFunctions();
        Assert.assertNotNull(functions, typeDef.getName() + " should expose functions");
        Assert.assertTrue(functions.stream().anyMatch(f -> name.equals(f.getName())),
                "Expected " + typeDef.getName() + " to expose " + name + ", got: "
                        + functions.stream().map(LibraryFunction::getName).toList());
    }

    private static TypeDef typeDefNamed(Library library, String name) {
        List<TypeDef> typeDefs = library.getTypeDefs();
        Assert.assertNotNull(typeDefs, library.getName() + " should expose type definitions");
        return typeDefs.stream()
                .filter(t -> name.equals(t.getName()))
                .findFirst()
                .orElseGet(() -> {
                    Assert.fail("No type definition named " + name + " in " + library.getName());
                    return null;
                });
    }

    private static Library loadOne(String name) {
        List<Library> libraries = new CopilotLibraryManager().loadFilteredLibraries(new String[]{name});
        Assert.assertFalse(libraries.isEmpty(), "Expected " + name + " to resolve");
        return libraries.get(0);
    }
}
