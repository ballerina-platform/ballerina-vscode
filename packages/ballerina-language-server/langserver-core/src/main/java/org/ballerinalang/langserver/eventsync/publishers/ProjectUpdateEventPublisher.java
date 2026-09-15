/*
 *  Copyright (c) 2022, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
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
package org.ballerinalang.langserver.eventsync.publishers;

import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.eventsync.EventKind;
import org.ballerinalang.langserver.eventsync.AbstractEventPublisher;

/**
 * Publishes the project update event.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.eventsync.EventPublisher")
public class ProjectUpdateEventPublisher extends AbstractEventPublisher {
    public static final String NAME = "Project update event publisher";
    
    @Override
    public EventKind getKind() {
        return EventKind.PROJECT_UPDATE;
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public void publish(ExtendedLanguageClient client, LanguageServerContext serverContext,
                        DocumentServiceContext context) {
        // The ai:// scheme is the AI copilot's frozen pre-edit baseline — a virtual clone the
        // user never edits directly. No project-update reaction applies to it: its diagnostics
        // have no consumer, and the pull-modules / compilation-error prompts would target a
        // project the user cannot act on. Each subscriber forces a package compilation, so
        // letting the baseline-seeding didOpen/didChange bursts through costs O(events) full
        // compiles. Skip the whole fan-out here so every subscriber, present and future, is
        // covered by a single check.
        if (CommonUtil.AI_SCHEME.equals(context.workspace().uriScheme())) {
            return;
        }
        subscribers.parallelStream()
                .forEach(subscriber -> subscriber.onEvent(client, context, serverContext));
    }
}
