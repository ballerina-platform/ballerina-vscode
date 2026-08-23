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

package io.ballerina.servicemodelgenerator.extension.model;

/**
 * A trigger as listed in the add-integration surfaces.
 *
 * @param id                   the trigger's identifier
 * @param name                 the trigger's module-derived name
 * @param orgName              the organization publishing the connector
 * @param packageName          the connector's package name
 * @param moduleName           the connector's module name
 * @param version              the connector's version
 * @param type                 the trigger's category bucket (e.g. {@code event}/{@code file})
 * @param displayName          the human-readable name shown on the card
 * @param documentation        a short summary of the trigger
 * @param listenerProtocol     the protocol its listener speaks
 * @param icon                 the icon reference shown for this trigger
 * @param agentTriggerKind     how this trigger calls an agent, or {@code null} when it cannot
 * @param deletionScope        what removing this trigger takes with it, or {@code null} when it cannot
 *                             call an agent
 */
public record TriggerBasicInfo(int id, String name, String orgName, String packageName, String moduleName,
                               String version, String type, String displayName, String documentation,
                               String listenerProtocol, String icon, String agentTriggerKind,
                               String deletionScope) {

    public TriggerBasicInfo(int id, String name, String orgName, String packageName, String moduleName,
                            String version, String type, String displayName, String documentation,
                            String listenerProtocol, String icon) {
        this(id, name, orgName, packageName, moduleName, version, type, displayName, documentation,
                listenerProtocol, icon, null, null);
    }

    public TriggerBasicInfo withAgentTrigger(String kind, String scope) {
        return new TriggerBasicInfo(id, name, orgName, packageName, moduleName, version, type, displayName,
                documentation, listenerProtocol, icon, kind, scope);
    }
}
