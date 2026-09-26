/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 */

package io.ballerina.servicemodelgenerator.extension.model.response;

/** A user-actionable reason why a service model could not be resolved.
 *
 * @param code        stable client-facing error code
 * @param message     safe user-facing explanation
 * @param orgName     connector organization, when known
 * @param packageName connector package, when known
 * @param moduleName  connector module, when known
 */
public record ModelResolutionError(String code, String message, String orgName, String packageName,
                                   String moduleName) {

    public static final String PACKAGE_NOT_RESOLVED = "PACKAGE_NOT_RESOLVED";
    public static final String TRIGGER_METADATA_NOT_FOUND = "TRIGGER_METADATA_NOT_FOUND";
    public static final String TRIGGER_METADATA_INVALID = "TRIGGER_METADATA_INVALID";
    public static final String TRIGGER_UI_METADATA_NOT_FOUND = "TRIGGER_UI_METADATA_NOT_FOUND";
    public static final String TRIGGER_UI_METADATA_INVALID = "TRIGGER_UI_METADATA_INVALID";
    public static final String SERVICE_NOT_FOUND = "SERVICE_NOT_FOUND";
    public static final String DOCUMENT_NOT_AVAILABLE = "DOCUMENT_NOT_AVAILABLE";
}
