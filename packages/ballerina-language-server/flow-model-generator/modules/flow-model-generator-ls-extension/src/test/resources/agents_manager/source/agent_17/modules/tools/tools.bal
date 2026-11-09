// Copyright (c) 2026 WSO2 LLC (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerina/ai;

# Looks up the weather for a city.
@ai:AgentTool
public isolated function getWeather(string city) returns string {
    return string `Sunny in ${city}`;
}

# Asks the forecaster agent about the weather.
@ai:AgentTool
public isolated function askForecaster(string question) returns string|error {
    ai:Agent forecaster = check new (
        systemPrompt = {role: "Forecaster", instructions: "Answer forecast questions."},
        model = check ai:getDefaultModelProvider()
    );
    return forecaster.run(question);
}
