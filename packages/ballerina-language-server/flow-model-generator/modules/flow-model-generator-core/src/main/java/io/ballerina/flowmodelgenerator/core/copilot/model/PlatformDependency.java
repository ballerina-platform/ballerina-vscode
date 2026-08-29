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

package io.ballerina.flowmodelgenerator.core.copilot.model;

import java.util.List;

/**
 * The spec {@code listeners[].platformDependencies} — a native artifact the build cannot fetch.
 *
 * @since 1.10.0
 */
public class PlatformDependency {

    private String coordinate;
    private Boolean provided;
    private String acquisitionUrl;
    private String acquisitionNote;
    private List<NativeLibrary> nativeLibraries;

    public PlatformDependency() {
    }

    public String getCoordinate() {
        return coordinate;
    }

    public void setCoordinate(String coordinate) {
        this.coordinate = coordinate;
    }

    public Boolean getProvided() {
        return provided;
    }

    public void setProvided(Boolean provided) {
        this.provided = provided;
    }

    public String getAcquisitionUrl() {
        return acquisitionUrl;
    }

    public void setAcquisitionUrl(String acquisitionUrl) {
        this.acquisitionUrl = acquisitionUrl;
    }

    public String getAcquisitionNote() {
        return acquisitionNote;
    }

    public void setAcquisitionNote(String acquisitionNote) {
        this.acquisitionNote = acquisitionNote;
    }

    public List<NativeLibrary> getNativeLibraries() {
        return nativeLibraries;
    }

    public void setNativeLibraries(List<NativeLibrary> nativeLibraries) {
        this.nativeLibraries = nativeLibraries;
    }
}
