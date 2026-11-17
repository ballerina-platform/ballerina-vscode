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

package io.ballerina.flowmodelgenerator.core.search;

import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Tests for {@link WorkspaceModuleSearchUtils#nameMatchesQuery}: a query of several words is matched word by word,
 * since the name of a function, workflow or activity has no spaces for the whole phrase to be found in.
 *
 * @since 1.7.0
 */
public class NameMatchesQueryTest {

    @DataProvider(name = "matchingQueries")
    public Object[][] matchingQueries() {
        return new Object[][]{
                {"sendEmail", ""},
                {"sendEmail", "   "},
                {"sendEmail", null},
                {"sendEmail", "send"},
                {"sendEmail", "email"},
                {"sendEmail", "SENDEMAIL"},
                {"sendEmail", "send email"},
                {"sendEmail", "email send"},
                {"sendEmail", "Send  Email"},
                {"sendEmail", " send email "},
                {"send_email", "send_email"},
                {"getUserById", "get user id"},
        };
    }

    @DataProvider(name = "missingQueries")
    public Object[][] missingQueries() {
        return new Object[][]{
                {"sendEmail", "sms"},
                {"sendEmail", "send sms"},
                {"sendEmail", "sms email"},
        };
    }

    @Test(dataProvider = "matchingQueries", description = "A name that contains every word of the query matches.")
    public void testEveryWordFound(String name, String query) {
        Assert.assertTrue(WorkspaceModuleSearchUtils.nameMatchesQuery(name, query));
    }

    @Test(dataProvider = "missingQueries", description = "A name that lacks one word of the query does not match.")
    public void testWordMissing(String name, String query) {
        Assert.assertFalse(WorkspaceModuleSearchUtils.nameMatchesQuery(name, query));
    }
}
