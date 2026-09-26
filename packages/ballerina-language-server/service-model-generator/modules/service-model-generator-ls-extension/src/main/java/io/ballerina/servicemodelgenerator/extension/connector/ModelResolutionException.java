/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
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

    public ModelResolutionError error() {
        return error;
    }
}
