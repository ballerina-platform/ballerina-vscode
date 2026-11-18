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

package io.ballerina.flowmodelgenerator.extension.response;

import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables;

import java.util.List;
import java.util.Map;

/**
 * The configurables a new connection's literals get when it is saved, as the connection form shows them.
 *
 * @since 1.9.0
 */
public class ConnectionConfigurablesResponse extends AbstractFlowModelResponse {

    private static final String GENERIC_ERROR_MSG = "the configurable names could not be worked out.";

    private List<ConnectionConfigurables.Preview> configurables = List.of();
    private Map<String, String> arguments = Map.of();

    @Override
    public void setError(Throwable e) {
        if (e instanceof UserFacingException) {
            super.setError(e);
            return;
        }
        setError(GENERIC_ERROR_MSG, e);
    }

    public void setConfigurables(List<ConnectionConfigurables.Preview> configurables) {
        this.configurables = configurables;
    }

    public List<ConnectionConfigurables.Preview> configurables() {
        return configurables;
    }

    /**
     * Each argument as saving would write it, by its property's key.
     */
    public void setArguments(Map<String, String> arguments) {
        this.arguments = arguments;
    }

    public Map<String, String> arguments() {
        return arguments;
    }
}
