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

package io.ballerina.artifactsgenerator;

import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Test the attach-point naming branch and its quote handling.
 *
 * @since 1.0.0
 */
public class ArtifactNamingTest {

    @Test(description = "Name Azure Files and SMB services from the attach point, and no other module")
    public void testUsesAttachPointAsName() {
        Assert.assertTrue(Artifact.usesAttachPointAsName("azure.storage.files"));
        // SMB's @smb:ServiceConfig path wins when present, so this is only its fallback.
        Assert.assertTrue(Artifact.usesAttachPointAsName("smb"));
        Assert.assertFalse(Artifact.usesAttachPointAsName("ftp"));
        Assert.assertFalse(Artifact.usesAttachPointAsName("http"));
        Assert.assertFalse(Artifact.usesAttachPointAsName(null));
        Assert.assertFalse(Artifact.usesAttachPointAsName("not.a.module"));
    }

    @Test(description = "Strip the quotes a string-literal attach point arrives with")
    public void testUnquote() {
        Assert.assertEquals(Artifact.unquote("\"/invoices\""), "/invoices");
        // The identifier form `service /invoices on lsn` reaches the builder already unquoted.
        Assert.assertEquals(Artifact.unquote("/invoices"), "/invoices");
        Assert.assertEquals(Artifact.unquote("\"\""), "");
        Assert.assertEquals(Artifact.unquote("\""), "\"");
        Assert.assertEquals(Artifact.unquote(""), "");
        Assert.assertNull(Artifact.unquote(null));
    }
}
