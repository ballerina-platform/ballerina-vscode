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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.utils.A2aUtil;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.projects.Document;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;

import java.util.Map;
import java.util.Optional;

/**
 * Represents a call on the task store of an A2A agent. Inside an executor's {@code execute} method the owner and the
 * task id are filled in from the request context and the updater.
 *
 * @since 1.0.0
 */
public class A2aTaskStoreBuilder extends MethodCall {

    private static final String GET = "get";
    private static final String ID = "id";
    private static final String OWNER = "owner";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.A2A_TASK_STORE;
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        super.setConcreteTemplateData(context);
        findExecutorScope(context).ifPresent(scope -> {
            prefill(OWNER, scope.contextName() + "?.owner");
            if (GET.equals(context.codedata().symbol())) {
                prefill(ID, scope.updaterName() + ".getTaskId()");
            }
        });
    }

    private Optional<A2aUtil.ExecutorScope> findExecutorScope(TemplateContext context) {
        try {
            context.workspaceManager().loadProject(context.filePath());
            SemanticModel semanticModel = FileSystemUtils.getSemanticModel(context.workspaceManager(),
                    context.filePath());
            Document document = FileSystemUtils.getDocument(context.workspaceManager(), context.filePath());
            return A2aUtil.findExecutorScope(semanticModel, document, context.position());
        } catch (WorkspaceDocumentException e) {
            return Optional.empty();
        } catch (EventSyncException e) {
            return Optional.empty();
        }
    }

    private void prefill(String parameter, String expression) {
        Map<String, Property> properties = properties().build();
        String key = FlowNodeUtil.getPropertyKey(parameter);
        Property property = properties.get(key);
        if (property != null) {
            properties.put(key, Property.Builder.copyFrom(property).value(expression).build());
        }
    }
}
