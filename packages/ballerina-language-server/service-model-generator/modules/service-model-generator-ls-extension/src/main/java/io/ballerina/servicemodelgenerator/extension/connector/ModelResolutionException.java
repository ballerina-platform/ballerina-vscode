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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.servicemodelgenerator.extension.model.response.ModelResolutionError;

/** Internal exception used to preserve a structured model-resolution failure. */
public class ModelResolutionException extends RuntimeException {

    private final transient ModelResolutionError error;

    public ModelResolutionException(ModelResolutionError error) {
        super(error.message());
        this.error = error;
    }

    /** Explains {@code cause}, which is kept so its stack trace still reaches the client. */
    public ModelResolutionException(ModelResolutionError error, Throwable cause) {
        super(error.message(), cause);
        this.error = error;
    }

    /** The frames of the failure behind {@code e}: its cause's when {@code e} only explains that failure. */
    public static StackTraceElement[] originStackTrace(Throwable e) {
        return e instanceof ModelResolutionException && e.getCause() != null
                ? e.getCause().getStackTrace() : e.getStackTrace();
    }

    public ModelResolutionError error() {
        return error;
    }
}
