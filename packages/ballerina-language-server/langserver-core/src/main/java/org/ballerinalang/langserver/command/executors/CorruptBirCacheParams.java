/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.ballerinalang.langserver.command.executors;

/**
 * Payload for the {@code projectService/corruptBirCache} notification.
 */
public class CorruptBirCacheParams {

    private final String org;
    private final String name;
    private final String version;
    private String distVersion;
    private String projectUri;

    public CorruptBirCacheParams(String org, String name, String version) {
        this.org = org;
        this.name = name;
        this.version = version;
    }

    public String getOrg() {
        return org;
    }

    public String getName() {
        return name;
    }

    public String getVersion() {
        return version;
    }

    public String getDistVersion() {
        return distVersion;
    }

    public void setDistVersion(String distVersion) {
        this.distVersion = distVersion;
    }

    public String getProjectUri() {
        return projectUri;
    }

    public void setProjectUri(String projectUri) {
        this.projectUri = projectUri;
    }
}
