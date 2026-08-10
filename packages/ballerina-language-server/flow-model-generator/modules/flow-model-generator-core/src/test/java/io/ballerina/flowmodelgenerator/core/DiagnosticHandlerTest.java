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
