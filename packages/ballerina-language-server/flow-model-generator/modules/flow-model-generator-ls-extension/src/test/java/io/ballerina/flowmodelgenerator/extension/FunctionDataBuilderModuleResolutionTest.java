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

import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Package;
import org.testng.Assert;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.util.Optional;

/**
 * Verifies that {@link FunctionDataBuilder} resolves a function against the module named by its
 * {@code moduleInfo} rather than against the package's default module.
 * <p>
 * For a package resolved from Ballerina Central, the semantic model used to be derived from the package's default
 * module, so a submodule symbol was either not found or silently shadowed by a same-named root function.
 * <p>
 * {@code ballerinax/edifact.d03a.supplychain} is the fixture because its root module and every {@code m<MSG>}
 * submodule export {@code fromEdiString}, and the two overloads differ in both arity and return type — a
 * structural difference that cannot false-pass the way a doc-text difference can. The
 * {@code node_template/config/function_call-central-*} configs cover the same ground through the LSP API; this
 * test exists to reach the branches that API cannot distinguish from the outside, in particular the
 * unknown-submodule fallback.
 *
 * @since 1.0.0
 */
public class FunctionDataBuilderModuleResolutionTest {

    private static final String ORG = "ballerinax";
    private static final String PACKAGE_NAME = "edifact.d03a.supplychain";
    private static final String VERSION = "0.9.0";
    private static final String SUBMODULE = PACKAGE_NAME + ".mORDERS";
    private static final String FUNCTION_NAME = "fromEdiString";

    private Package resolvedPackage;

    @BeforeClass
    public void resolveFixturePackage() {
        Optional<Package> optPackage = PackageUtil.resolveModulePackage(ORG, PACKAGE_NAME, VERSION);
        Assert.assertTrue(optPackage.isPresent(), String.format(
                "'%s/%s:%s' is not provisioned in the offline test cache. Add it to "
                        + "build-config/ballerina_dependencies (both Ballerina.toml and an 'as _' import in "
                        + "main.bal) and regenerate Dependencies.toml.", ORG, PACKAGE_NAME, VERSION));
        this.resolvedPackage = optPackage.get();
    }

    /**
     * The reported case: the submodule overload takes a single {@code ediText} parameter and returns the typed
     * per-message record. Before the fix this returned the root overload instead.
     */
    @Test
    public void testSubmoduleFunctionResolvesToSubmoduleOverload() {
        FunctionData functionData = buildFunction(SUBMODULE, FUNCTION_NAME);

        Assert.assertEquals(functionData.parameters().size(), 1,
                "Expected the mORDERS overload, which takes only 'ediText'. Two parameters means the package "
                        + "root's (string, EDI_NAME) overload was resolved instead.");
        Assert.assertTrue(functionData.parameters().containsKey("ediText"),
                "Expected the mORDERS overload's 'ediText' parameter, got: " + functionData.parameters().keySet());
        Assert.assertTrue(functionData.returnType().contains("EDI_ORDERS"),
                "Expected the submodule's typed record return, got: " + functionData.returnType());
    }

    /**
     * A function that exists only in the submodule. Before the fix the root-module symbol lookup found nothing and
     * {@code build()} threw {@code IllegalStateException("Function symbol not found")}.
     */
    @Test
    public void testSubmoduleOnlyFunctionIsFound() {
        FunctionData functionData = buildFunction(SUBMODULE, "transformFromEdiString");

        Assert.assertEquals(functionData.name(), "transformFromEdiString");
        Assert.assertEquals(functionData.parameters().size(), 1);
    }

    /**
     * The default-module fallback must stay intact: a root-module function of a package that has submodules still
     * resolves to the root overload.
     */
    @Test
    public void testRootModuleFunctionStillResolvesToRootOverload() {
        FunctionData functionData = buildFunction(PACKAGE_NAME, FUNCTION_NAME);

        Assert.assertEquals(functionData.parameters().size(), 2,
                "Expected the package root's (string ediText, EDI_NAME ediName) overload.");
        Assert.assertTrue(functionData.parameters().containsKey("ediName"),
                "Expected the root overload's 'ediName' parameter, got: " + functionData.parameters().keySet());
        Assert.assertEquals(functionData.returnType(), "anydata");
    }

    /**
     * Pins the current fallback for a module name that matches nothing in the package: the builder degrades to the
     * default module rather than throwing.
     * <p>
     * This documents existing behaviour, it does not endorse it — silently returning a different function for an
     * unrecognised submodule is exactly how the root-vs-submodule bug presented in the first place. If that
     * contract is ever tightened to report an error, this test is the one to change.
     */
    @Test
    public void testUnknownSubmoduleFallsBackToDefaultModule() {
        FunctionData functionData = buildFunction(PACKAGE_NAME + ".mNOSUCHMESSAGE", FUNCTION_NAME);

        Assert.assertEquals(functionData.parameters().size(), 2,
                "An unresolvable submodule name is expected to fall back to the package default module.");
    }

    /**
     * The target module is picked at build time, not when the package is set, so the two setters may be called in
     * either order. Without that, a caller supplying the package first would silently get the default module.
     */
    @Test
    public void testSetterOrderDoesNotAffectModuleResolution() {
        FunctionData functionData = new FunctionDataBuilder()
                .name(FUNCTION_NAME)
                .resolvedPackage(resolvedPackage)
                .moduleInfo(new ModuleInfo(ORG, PACKAGE_NAME, SUBMODULE, VERSION))
                .build();

        Assert.assertEquals(functionData.parameters().size(), 1,
                "Setting resolvedPackage() before moduleInfo() must still resolve the mORDERS overload; two "
                        + "parameters means the module was chosen before the module name was known.");
    }

    private FunctionData buildFunction(String moduleName, String functionName) {
        return new FunctionDataBuilder()
                .name(functionName)
                .moduleInfo(new ModuleInfo(ORG, PACKAGE_NAME, moduleName, VERSION))
                .resolvedPackage(resolvedPackage)
                .build();
    }
}
