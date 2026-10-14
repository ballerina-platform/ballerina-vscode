/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package org.ballerinalang.langserver.eventsync.subscribers;

import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.compiler.BLangCompilerException;
import org.ballerinalang.langserver.LSContextOperation;
import org.ballerinalang.langserver.command.executors.PullModuleExecutor;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.eventsync.EventKind;
import org.ballerinalang.langserver.commons.eventsync.spi.EventSubscriber;

/**
 * Subscriber should gracefully handle compilation errors by notifying the extension.
 *
 * @since 1.2.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.eventsync.spi.EventSubscriber")
public class ResolveCompilationErrorsSubscriber implements EventSubscriber {

    public static final String NAME = "Resolve compilation errors subscriber";
    private static final String PULL_MODULES_ACTION = "Pull Modules";
    private static final String ERROR_MESSAGE = "Language server has stopped working due to unresolved modules " +
            "in your project. Please resolve them to proceed.";

    @Override
    public EventKind eventKind() {
        return EventKind.PROJECT_UPDATE;
    }

    @Override
    public void onEvent(ExtendedLanguageClient client, DocumentServiceContext context,
                        LanguageServerContext serverContext) {
        // Skip this for project load since it's handled by the extension.
        if (context.operation() == LSContextOperation.LOAD_PROJECT) {
            return;
        }

        // TODO: Skip this subscriber once diagnostic mentioned in
        //  https://github.com/ballerina-platform/ballerina-lang/issues/44275 is available in the distribution.
        try {
            context.workspace().waitAndGetPackageCompilation(context.filePath());
        } catch (BLangCompilerException e) {
            if (PullModuleExecutor.isMissingModuleFailure(e)) {
                PullModuleExecutor.resolveModules(context.fileUri(), client, context.workspace(),
                        context.languageServercontext(), true);

                // TODO: Restore along with https://github.com/wso2/product-ballerina-integrator/issues/1488
//                ShowMessageRequestParams showMessageRequestParams = new ShowMessageRequestParams();
//                showMessageRequestParams.setType(MessageType.Error);
//                showMessageRequestParams.setMessage(ERROR_MESSAGE);
//                showMessageRequestParams.setActions(List.of(new MessageActionItem(PULL_MODULES_ACTION)));
//
//                client.showMessageRequest(showMessageRequestParams).thenAccept(action -> {
//                    if (action != null && PULL_MODULES_ACTION.equals(action.getTitle())) {
//                        PullModuleExecutor.resolveModules(context.fileUri(), client, context.workspace(),
//                                context.languageServercontext(), true);
//                    }
//                });
            }
        }
    }

    @Override
    public String getName() {
        return NAME;
    }
}
