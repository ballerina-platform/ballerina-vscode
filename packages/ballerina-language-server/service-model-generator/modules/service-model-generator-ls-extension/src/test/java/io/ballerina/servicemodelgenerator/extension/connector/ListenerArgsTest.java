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

import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator.ListenerArgs;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Direct unit tests for {@code ListenerArgs}' CDC-style skip-list merging (previously a
 * regex-splice into already-rendered record text) — covers the adversarial shapes the review
 * flagged: a same-named field nested inside a sub-record, a list-field name that is a substring of
 * a different field's name, and two distinct list fields folding into the same record slot.
 *
 * @since 1.9.0
 */
public class ListenerArgsTest {

    @Test
    public void testSkipListMergesIntoFreshRecordWhenNoneIncluded() {
        ListenerArgs args = new ListenerArgs();
        args.addSkippedOperation("options", "skippedOperations", "\"u\"");
        args.addSkippedOperation("options", "skippedOperations", "\"d\"");

        Assert.assertEquals(args.render(), "options = {skippedOperations: [\"u\", \"d\"]}");
    }

    @Test
    public void testSkipListMergesIntoExistingIncludedRecord() {
        ListenerArgs args = new ListenerArgs();
        args.addIncludedArg("options", "{snapshotMode: \"no_data\"}");
        args.addSkippedOperation("options", "skippedOperations", "\"u\"");

        Assert.assertEquals(args.render(), "options = {snapshotMode: \"no_data\", skippedOperations: [\"u\"]}");
    }

    @Test
    public void testSkipListDoesNotCorruptSameNamedFieldNestedInSubRecord() {
        // Regression: the old regex-splice matched `listField: [...]` anywhere in the rendered text,
        // including inside a nested sub-record — it would have rewritten the nested `skippedOperations`
        // instead of adding a new top-level one. The new top-level-only field split must leave it alone.
        ListenerArgs args = new ListenerArgs();
        args.addIncludedArg("options", "{sub: {skippedOperations: [\"z\"]}, mode: \"x\"}");
        args.addSkippedOperation("options", "skippedOperations", "\"u\"");

        String rendered = args.render();
        Assert.assertEquals(rendered,
                "options = {sub: {skippedOperations: [\"z\"]}, mode: \"x\", skippedOperations: [\"u\"]}");
    }

    @Test
    public void testSkipListDoesNotMatchSubstringOfAnotherFieldName() {
        // Regression: the old regex had no word-boundary anchoring, so a list field whose name is a
        // substring of an existing, differently-named field (e.g. "codes" inside "errorCodes") could
        // misfire. The new exact top-level field-name comparison must not confuse the two.
        ListenerArgs args = new ListenerArgs();
        args.addIncludedArg("options", "{errorCodes: [\"x\"]}");
        args.addSkippedOperation("options", "codes", "\"u\"");

        String rendered = args.render();
        Assert.assertEquals(rendered, "options = {errorCodes: [\"x\"], codes: [\"u\"]}");
    }

    @Test
    public void testTwoDistinctListFieldsMergeIntoTheSameFreshRecord() {
        // Regression: skipLists used to be keyed only by recordField, so a second list field
        // targeting the same record silently dropped its name and merged under the first's.
        ListenerArgs args = new ListenerArgs();
        args.addSkippedOperation("options", "skippedOperations", "\"u\"");
        args.addSkippedOperation("options", "excludedColumns", "\"col1\"");

        Assert.assertEquals(args.render(),
                "options = {skippedOperations: [\"u\"], excludedColumns: [\"col1\"]}");
    }

    @Test
    public void testTwoDistinctListFieldsMergeIntoTheSameExistingIncludedRecord() {
        ListenerArgs args = new ListenerArgs();
        args.addIncludedArg("options", "{snapshotMode: \"no_data\"}");
        args.addSkippedOperation("options", "skippedOperations", "\"u\"");
        args.addSkippedOperation("options", "excludedColumns", "\"col1\"");

        Assert.assertEquals(args.render(),
                "options = {snapshotMode: \"no_data\", skippedOperations: [\"u\"], excludedColumns: [\"col1\"]}");
    }

    @Test
    public void testInsertListFieldLeavesNonRecordArgUntouched() {
        // A variable reference / expression the user typed is not a record literal: must be left alone.
        Assert.assertEquals(
                ListenerArgs.insertListField("myOptionsVar", "skippedOperations", "skippedOperations: [\"u\"]"),
                "myOptionsVar");
    }

    @Test
    public void testSplitTopLevelFieldsRespectsQuotedCommasAndBrackets() {
        List<String> fields = ListenerArgs.splitTopLevelFields(
                "a: \"x, [y]\", b: {c: 1, d: 2}, e: [1, 2, 3]");
        Assert.assertEquals(fields, List.of("a: \"x, [y]\"", "b: {c: 1, d: 2}", "e: [1, 2, 3]"));
    }
}
