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

package io.ballerina.flowmodelgenerator.extension.toolkitmanager;

import io.ballerina.modelgenerator.commons.PackageUtil;
import org.testng.SkipException;

/**
 * The A2A toolkit tests read {@code ai:A2aToolKit}, which is not in a released ai package yet. They run when the
 * package is in the local repository of the test Ballerina home, and are skipped otherwise.
 *
 * @since 1.4.0
 */
final class A2aAiPackage {

    static final String VERSION = "1.18.0";

    private A2aAiPackage() {
    }

    static void requireAvailable() {
        boolean available = PackageUtil.getModulePackage(PackageUtil.getSampleProject(), "ballerina", "ai", VERSION,
                "local").isPresent();
        if (!available) {
            throw new SkipException("ballerina/ai " + VERSION + " (with A2aToolKit) is not in the local repository");
        }
    }
}
