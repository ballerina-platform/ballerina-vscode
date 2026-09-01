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

package io.ballerina.servicemodelgenerator.extension.model.response;

import io.ballerina.servicemodelgenerator.extension.connector.ConnectorUpgradeAdvisor.ConnectorUpgradeAdvice;

import java.util.Arrays;
import java.util.List;

public record ConnectorUpgradeAdviceResponse(List<ConnectorUpgradeAdvice> advice, String errorMsg,
                                             String stacktrace) {

    public ConnectorUpgradeAdviceResponse(List<ConnectorUpgradeAdvice> advice) {
        this(advice, null, null);
    }

    public ConnectorUpgradeAdviceResponse(Throwable e) {
        this(List.of(), e.toString(), Arrays.toString(e.getStackTrace()));
    }
}
