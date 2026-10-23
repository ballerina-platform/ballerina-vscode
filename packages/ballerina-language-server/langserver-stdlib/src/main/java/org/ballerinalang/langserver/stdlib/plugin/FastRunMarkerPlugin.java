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
import io.ballerina.projects.plugins.CodeModifier;
import io.ballerina.projects.plugins.CodeModifierContext;
import io.ballerina.projects.plugins.CompilerPlugin;
import io.ballerina.projects.plugins.CompilerPluginContext;
import io.ballerina.projects.plugins.SourceModifierContext;
import io.ballerina.tools.text.TextDocuments;

/**
 * Test compiler plugin of {@code lstest/fastrun_marker}: its code modifier rewrites the importing package's sources,
 * so a test can tell whether a run executed the modified program.
 *
 * @since 1.10.0
 */
public class FastRunMarkerPlugin extends CompilerPlugin {

    static final String MARKER = "__FAST_RUN_MARKER__";
    static final String REPLACEMENT = "code modifier";
    static final String FAILURE_MARKER = "__FAST_RUN_PLUGIN_FAILURE__";

    @Override
    public void init(CompilerPluginContext pluginContext) {
        pluginContext.addCodeModifier(new MarkerModifier());
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
                    if (source.contains(MARKER)) {
                        context.modifySourceFile(TextDocuments.from(source.replace(MARKER, REPLACEMENT)), documentId);
                    }
                }
            }
        }
    }
}
