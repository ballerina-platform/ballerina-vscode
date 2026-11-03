/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
package org.ballerinalang.langserver.stdlib.plugin;

import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.plugins.CodeAnalysisContext;
import io.ballerina.projects.plugins.CodeAnalyzer;
import io.ballerina.projects.plugins.CodeModifier;
import io.ballerina.projects.plugins.CodeModifierContext;
import io.ballerina.projects.plugins.CompilationAnalysisContext;
import io.ballerina.projects.plugins.CompilerPlugin;
import io.ballerina.projects.plugins.CompilerPluginContext;
import io.ballerina.projects.plugins.SourceModifierContext;
import io.ballerina.tools.text.TextDocuments;

/**
 * Test compiler plugin of {@code lstest/fastrun_marker}: its code modifier rewrites the importing package's sources,
 * so a test can tell whether a run executed the modified program. Its code analyzer fails only on source the modifier
 * produced, so a test can tell which step reports it.
 *
 * @since 1.10.0
 */
public class FastRunMarkerPlugin extends CompilerPlugin {

    static final String MARKER = "__FAST_RUN_MARKER__";
    static final String REPLACEMENT = "code modifier";
    static final String FAILURE_MARKER = "__FAST_RUN_PLUGIN_FAILURE__";
    static final String ANALYZER_FAILURE_MARKER = "__FAST_RUN_ANALYZER_FAILURE__";
    static final String ANALYZER_FAILURE_TRIGGER = "__FAST_RUN_MODIFIED_FOR_ANALYZER__";

    @Override
    public void init(CompilerPluginContext pluginContext) {
        pluginContext.addCodeModifier(new MarkerModifier());
        pluginContext.addCodeAnalyzer(new ModifiedSourceAnalyzer());
    }

    private static class MarkerModifier extends CodeModifier {

        @Override
        public void init(CodeModifierContext modifierContext) {
            modifierContext.addSourceModifierTask(MarkerModifier::rewrite);
        }

        private static void rewrite(SourceModifierContext context) {
            for (Module module : context.currentPackage().modules()) {
                for (DocumentId documentId : module.documentIds()) {
                    Document document = module.document(documentId);
                    String source = document.textDocument().toString();
                    if (source.contains(FAILURE_MARKER)) {
                        // No message, like the NPEs real plugins throw.
                        throw new IllegalStateException();
                    }
                    String modified = source.replace(MARKER, REPLACEMENT)
                            .replace(ANALYZER_FAILURE_MARKER, ANALYZER_FAILURE_TRIGGER);
                    if (!modified.equals(source)) {
                        context.modifySourceFile(TextDocuments.from(modified), documentId);
                    }
                }
            }
        }
    }

    private static class ModifiedSourceAnalyzer extends CodeAnalyzer {

        @Override
        public void init(CodeAnalysisContext analysisContext) {
            analysisContext.addCompilationAnalysisTask(ModifiedSourceAnalyzer::analyze);
        }

        private static void analyze(CompilationAnalysisContext context) {
            Package currentPackage = context.currentPackage();
            for (Module module : currentPackage.modules()) {
                for (DocumentId documentId : module.documentIds()) {
                    if (module.document(documentId).textDocument().toString().contains(ANALYZER_FAILURE_TRIGGER)) {
                        throw new IllegalStateException();
                    }
                }
            }
        }
    }
}
