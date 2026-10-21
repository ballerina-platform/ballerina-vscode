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

import io.ballerina.flowmodelgenerator.core.model.Diagnostics;
import io.ballerina.tools.diagnostics.Diagnostic;
import io.ballerina.tools.diagnostics.DiagnosticFactory;
import io.ballerina.tools.diagnostics.DiagnosticInfo;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextRange;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Tests for {@link DiagnosticHandler}.
 * <p>
 * The handler advances a single cursor while flow nodes are visited in source order, so it must
 * sort the incoming diagnostics by position. Package compilation appends compiler-plugin
 * diagnostics (e.g., the workflow plugin's WORKFLOW_1xx codes) after the semantic-phase ones,
 * which breaks the within-file position order.
 *
 * @since 1.5.0
 */
public class DiagnosticHandlerTest {

    private static final String FILE_NAME = "main.bal";

    @Test(description = "Out-of-order diagnostics (plugin diagnostics appended after semantic ones) "
            + "must be attached to their respective nodes")
    public void testOutOfOrderDiagnosticsAttachToNodes() {
        LineRange earlyNodeRange = range(5, 0, 6, 1);
        LineRange lateNodeRange = range(10, 0, 11, 1);

        // The semantic diagnostic (line 10) is emitted before the plugin diagnostic (line 5),
        // mirroring PackageCompilation.diagnosticResult() ordering.
        Diagnostic semanticDiagnostic = diagnostic(lateNodeRange, "semantic error on the late node");
        Diagnostic pluginDiagnostic = diagnostic(earlyNodeRange, "plugin error on the early node");
        DiagnosticHandler handler = new DiagnosticHandler(List.of(semanticDiagnostic, pluginDiagnostic));

        TestDiagnosticsBuilder earlyNode = new TestDiagnosticsBuilder();
        TestDiagnosticsBuilder lateNode = new TestDiagnosticsBuilder();

        // Nodes are visited in source order.
        handler.handle(earlyNode, earlyNodeRange, true);
        handler.handle(lateNode, lateNodeRange, true);

        Diagnostics earlyDiagnostics = earlyNode.diagnostics().build();
        Assert.assertTrue(earlyDiagnostics.hasDiagnostics(),
                "Expected the plugin diagnostic to be attached to the early node");
        Assert.assertEquals(earlyDiagnostics.diagnostics().getFirst().message(),
                "plugin error on the early node");

        Diagnostics lateDiagnostics = lateNode.diagnostics().build();
        Assert.assertTrue(lateDiagnostics.hasDiagnostics(),
                "Expected the semantic diagnostic to be attached to the late node");
        Assert.assertEquals(lateDiagnostics.diagnostics().getFirst().message(),
                "semantic error on the late node");
    }

    @Test(description = "Non-error diagnostics are filtered out")
    public void testNonErrorDiagnosticsFiltered() {
        LineRange nodeRange = range(3, 0, 3, 20);
        Diagnostic warning = diagnostic(nodeRange, "a warning", DiagnosticSeverity.WARNING);
        DiagnosticHandler handler = new DiagnosticHandler(List.of(warning));

        TestDiagnosticsBuilder node = new TestDiagnosticsBuilder();
        handler.handle(node, nodeRange, true);
        Assert.assertFalse(node.diagnostics().build().hasDiagnostics(),
                "Warnings should not be attached to flow nodes");
    }

    @Test(description = "A diagnostic spanning a whole call belongs to the node, not to the first argument within it")
    public void testCallDiagnosticNotAttachedToArgument() {
        // string var1 = function1(2, "");
        LineRange nodeRange = range(4, 8, 4, 40);
        LineRange callRange = range(4, 22, 4, 39);
        LineRange firstArgRange = range(4, 32, 4, 33);
        LineRange secondArgRange = range(4, 35, 4, 37);
        DiagnosticHandler handler = new DiagnosticHandler(List.of(
                diagnostic(callRange, "incompatible types: expected string, found (string|error)")));

        TestDiagnosticsBuilder node = new TestDiagnosticsBuilder();
        TestDiagnosticsBuilder firstArg = new TestDiagnosticsBuilder();
        TestDiagnosticsBuilder secondArg = new TestDiagnosticsBuilder();
        handler.handle(node, nodeRange, false);
        handler.handle(firstArg, firstArgRange, true);
        handler.handle(secondArg, secondArgRange, true);
        handler.resolveUnconsumed(node);

        Assert.assertFalse(firstArg.diagnostics().build().hasDiagnostics(),
                "The first argument does not cause the diagnostic of the call");
        Assert.assertFalse(secondArg.diagnostics().build().hasDiagnostics(),
                "The second argument does not cause the diagnostic of the call");
        Diagnostics nodeDiagnostics = node.diagnostics().build();
        Assert.assertEquals(nodeDiagnostics.diagnostics().size(), 1);
        Assert.assertEquals(nodeDiagnostics.diagnostics().getFirst().message(),
                "incompatible types: expected string, found (string|error)");
    }

    @Test(description = "A call-wide diagnostic does not hide a diagnostic of a later argument")
    public void testCallDiagnosticDoesNotMaskArgumentDiagnostic() {
        // boolean d = check ctx->awaitHumanTask("approve", userRoles = APPROVERS);
        LineRange nodeRange = range(32, 4, 32, 76);
        LineRange callRange = range(32, 22, 32, 75);
        LineRange firstArgRange = range(32, 42, 32, 51);
        LineRange secondArgRange = range(32, 65, 32, 74);
        DiagnosticHandler handler = new DiagnosticHandler(List.of(
                diagnostic(callRange, "missing required parameter taskInput"),
                diagnostic(secondArgRange, "incompatible types")));

        TestDiagnosticsBuilder node = new TestDiagnosticsBuilder();
        TestDiagnosticsBuilder firstArg = new TestDiagnosticsBuilder();
        TestDiagnosticsBuilder secondArg = new TestDiagnosticsBuilder();
        handler.handle(node, nodeRange, false);
        handler.handle(firstArg, firstArgRange, true);
        handler.handle(secondArg, secondArgRange, true);
        handler.resolveUnconsumed(node);

        Assert.assertFalse(firstArg.diagnostics().build().hasDiagnostics());
        Assert.assertEquals(secondArg.diagnostics().build().diagnostics().getFirst().message(),
                "incompatible types");
        List<Diagnostics.Info> nodeDiagnostics = node.diagnostics().build().diagnostics();
        Assert.assertEquals(nodeDiagnostics.size(), 1);
        Assert.assertEquals(nodeDiagnostics.getFirst().message(), "missing required parameter taskInput");
    }

    @Test(description = "A diagnostic within an argument still belongs to that argument")
    public void testArgumentDiagnosticAttachedToArgument() {
        LineRange nodeRange = range(4, 8, 4, 40);
        LineRange firstArgRange = range(4, 32, 4, 33);
        DiagnosticHandler handler = new DiagnosticHandler(List.of(diagnostic(firstArgRange, "undefined symbol x")));

        TestDiagnosticsBuilder node = new TestDiagnosticsBuilder();
        TestDiagnosticsBuilder firstArg = new TestDiagnosticsBuilder();
        handler.handle(node, nodeRange, false);
        handler.handle(firstArg, firstArgRange, true);
        handler.resolveUnconsumed(node);

        Assert.assertEquals(firstArg.diagnostics().build().diagnostics().getFirst().message(),
                "undefined symbol x");
        Assert.assertTrue(node.diagnostics().build().diagnostics() == null
                        || node.diagnostics().build().diagnostics().isEmpty(),
                "The node must not repeat a diagnostic its argument claimed");
    }

    private static LineRange range(int startLine, int startOffset, int endLine, int endOffset) {
        return LineRange.from(FILE_NAME, LinePosition.from(startLine, startOffset),
                LinePosition.from(endLine, endOffset));
    }

    private static Diagnostic diagnostic(LineRange lineRange, String message) {
        return diagnostic(lineRange, message, DiagnosticSeverity.ERROR);
    }

    private static Diagnostic diagnostic(LineRange lineRange, String message, DiagnosticSeverity severity) {
        Location location = new Location() {
            @Override
            public LineRange lineRange() {
                return lineRange;
            }

            @Override
            public TextRange textRange() {
                return TextRange.from(0, 0);
            }
        };
        DiagnosticInfo info = new DiagnosticInfo("TEST_001", message, severity);
        return DiagnosticFactory.createDiagnostic(info, location);
    }

    /**
     * Minimal {@link DiagnosticHandler.DiagnosticCapable} that records the attached diagnostics.
     */
    private static class TestDiagnosticsBuilder implements DiagnosticHandler.DiagnosticCapable {

        private final Diagnostics.Builder<TestDiagnosticsBuilder> builder = new Builder<>(this);

        @Override
        public Diagnostics.Builder<TestDiagnosticsBuilder> diagnostics() {
            return builder;
        }

        private static class Builder<T> extends Diagnostics.Builder<T> {

            Builder(T parent) {
                super(parent);
            }
        }
    }
}
