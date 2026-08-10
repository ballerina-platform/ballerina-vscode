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

package io.ballerina.flowmodelgenerator.core;

/**
 * Signals a condition the user can act on — a required form field left empty, a construct the
 * editor cannot rewrite — as opposed to an internal failure. The message is written for the user,
 * so the front end shows it verbatim instead of a generic "the operation could not be applied".
 *
 * @since 1.8.0
 */
public class UserFacingException extends RuntimeException {

    public UserFacingException(String message) {
        super(message);
    }
}
