/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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
import io.ballerina.flowmodelgenerator.core.model.Diagnostics;
import io.ballerina.tools.diagnostics.Diagnostic;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.PositionUtil;

import java.util.Collection;
import java.util.Comparator;
import java.util.Iterator;

/**
 * Handles diagnostics for a given flow model.
 *
 * @since 1.0.0
 */
public class DiagnosticHandler {

    private final Iterator<Diagnostic> iterator;
    private Diagnostic currentDiagnostic;
    private boolean hasNodeAnnotated;
    private DiagnosticCapable pendingBuilder;
    private LineRange pendingNodeLineRange;

    public DiagnosticHandler(SemanticModel semanticModel) {
        // TODO: Consider all the diagnostics once fixed: #256
        this(semanticModel.diagnostics());
    }

    public DiagnosticHandler(Collection<Diagnostic> diagnostics) {
        // The handler advances a single cursor while nodes are visited in source order, so the
        // diagnostics must be sorted by file and position. Package compilation diagnostics append
        // compiler-plugin diagnostics (e.g., the workflow plugin's WORKFLOW_1xx codes) after the
        // semantic-phase ones, which breaks the within-file position order and would cause
        // plugin diagnostics to be skipped and never attached to flow nodes.
        iterator = diagnostics.stream()
                .filter(diagnostic -> diagnostic.diagnosticInfo().severity() == DiagnosticSeverity.ERROR)
                .sorted(Comparator
                        .comparing((Diagnostic diagnostic) -> diagnostic.location().lineRange().fileName(),
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparingInt(diagnostic -> diagnostic.location().lineRange().startLine().line())
                        .thenComparingInt(diagnostic -> diagnostic.location().lineRange().startLine().offset()))
                .iterator();
        hasNodeAnnotated = false;
        if (iterator.hasNext()) {
            currentDiagnostic = iterator.next();
        }
    }

    /**
     * Handles the diagnostic for the given node line range. Adds the diagnostic via the builder if the line ranges map
     * to the corresponding node line range.
     *
     * @param builder       the builder capable of adding diagnostics
     * @param nodeLineRange the line range of the node
     * @param isLeafNode    whether the node is a leaf node
     */
    public void handle(DiagnosticCapable builder, LineRange nodeLineRange, boolean isLeafNode) {
        if (currentDiagnostic == null) {
            return;
        }
        LinePosition nodeStartLine = nodeLineRange.startLine();

        while (currentDiagnostic != null) {
            // Check if the diagnostic is in the same file as the node
            String fileName = nodeLineRange.fileName();
            if (fileName != null && !fileName.equals(currentDiagnostic.location().lineRange().fileName())) {
                next();
                continue;
            }

            // Checks if the diagnostic has passed the node
            LineRange diagnosticLineRange = currentDiagnostic.location().lineRange();
            LinePosition diagnosticEndLine = diagnosticLineRange.endLine();
            while (hasDiagnosticPassed(nodeStartLine, diagnosticEndLine, isLeafNode)) {
                // Attach skipped diagnostic to the pending enclosing node before advancing
                if (pendingBuilder != null && pendingNodeLineRange != null &&
                        PositionUtil.isWithinLineRange(diagnosticLineRange, pendingNodeLineRange)) {
                    pendingBuilder.diagnostics()
                            .diagnostic(currentDiagnostic.diagnosticInfo().severity(),
                                    currentDiagnostic.message());
                }
                if (iterator.hasNext()) {
                    currentDiagnostic = iterator.next();
                    hasNodeAnnotated = false;
                    diagnosticLineRange = currentDiagnostic.location().lineRange();
                    diagnosticEndLine = diagnosticLineRange.endLine();
                    continue;
                }
                currentDiagnostic = null;
                return;
            }

            boolean isNodeWithinDiagnostic = PositionUtil.isWithinLineRange(nodeLineRange, diagnosticLineRange);
            boolean isDiagnosticWithinNode = PositionUtil.isWithinLineRange(diagnosticLineRange, nodeLineRange);

            // Both node and diagnostic are within the same range
            if (isNodeWithinDiagnostic && isDiagnosticWithinNode) {
                if (!isLeafNode) {
                    hasNodeAnnotated = true;
                }
                addDiagnostic(builder);
                next();
                continue;
            }

            // Node is within the diagnostic range
            if (isNodeWithinDiagnostic) {
                if (handleLeafNode(builder, isLeafNode)) {
                    continue;
                }
                hasNodeAnnotated = true;
                addDiagnostic(builder);
                return;
            }

            // Diagnostic is within the node range
            if (isDiagnosticWithinNode) {
                if (handleLeafNode(builder, isLeafNode)) {
                    continue;
                }
                builder.diagnostics().hasDiagnostics();
                pendingBuilder = builder;
                pendingNodeLineRange = nodeLineRange;
            }
            return;
        }
    }

    private boolean handleLeafNode(DiagnosticCapable builder, boolean isLeafNode) {
        if (isLeafNode) {
            if (!hasNodeAnnotated) {
                addDiagnostic(builder);
            }
            next();
            return true;
        }
        return false;
    }

    private void next() {
        this.currentDiagnostic = iterator.hasNext() ? iterator.next() : null;
        hasNodeAnnotated = false;
    }

    private void addDiagnostic(DiagnosticCapable builder) {
        builder.diagnostics()
                .diagnostic(currentDiagnostic.diagnosticInfo().severity(), currentDiagnostic.message());
        if (pendingBuilder == builder) {
            pendingBuilder = null;
            pendingNodeLineRange = null;
        }
    }

    /**
     * Resolves any pending diagnostics that were not consumed by child nodes. If the current diagnostic is still
     * within the pending node's range and no child has claimed it, attaches the full diagnostic to the pending node.
     *
     * @param builder the builder of the node being ended
     */
    public void resolveUnconsumed(DiagnosticCapable builder) {
        if (pendingBuilder == null || pendingBuilder != builder || currentDiagnostic == null) {
            return;
        }
        LineRange nodeLineRange = pendingNodeLineRange;
        pendingBuilder = null;
        pendingNodeLineRange = null;
        LineRange diagnosticLineRange = currentDiagnostic.location().lineRange();
        while (currentDiagnostic != null &&
                PositionUtil.isWithinLineRange(diagnosticLineRange, nodeLineRange)) {
            builder.diagnostics()
                    .diagnostic(currentDiagnostic.diagnosticInfo().severity(), currentDiagnostic.message());
            next();
            if (currentDiagnostic != null) {
                diagnosticLineRange = currentDiagnostic.location().lineRange();
            }
        }
    }

    private static boolean hasDiagnosticPassed(LinePosition nodeStartLine, LinePosition diagnosticEndLine,
                                               boolean isLeafNode) {
        return !isLeafNode && (nodeStartLine.line() > diagnosticEndLine.line() ||
                (nodeStartLine.line() == diagnosticEndLine.line() &&
                        nodeStartLine.offset() > diagnosticEndLine.offset()));
    }

    /**
     * Interface representing a builder capable of adding diagnostics. The builder which has the capability to add
     * diagnostic should implement this interface.
     *
     * @since 1.0.0
     */
    public interface DiagnosticCapable {

        Diagnostics.Builder<?> diagnostics();
    }
}
