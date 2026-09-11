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

package org.ballerinalang.langserver.workspace.observability;

import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Tests for {@link TraceSinkFactory} sink resolution.
 *
 * @since 1.7.0
 */
public class TraceSinkFactoryTest {

    @AfterMethod
    public void tearDown() {
        System.clearProperty(TraceSinkFactory.SINKS_PROPERTY);
    }

    /**
     * Verifies the default sink set is a single file sink.
     */
    @Test
    public void resolve_default_isFileSink() {
        List<TraceLogSink> sinks = TraceSinkFactory.resolve();

        Assert.assertEquals(sinks.size(), 1);
        Assert.assertTrue(sinks.get(0) instanceof FileTraceLogSink);
        sinks.forEach(TraceLogSink::close);
    }

    /**
     * Verifies {@code console,file} resolves to both sinks in order.
     */
    @Test
    public void resolve_consoleAndFile_returnsBoth() {
        System.setProperty(TraceSinkFactory.SINKS_PROPERTY, "console,file");

        List<TraceLogSink> sinks = TraceSinkFactory.resolve();

        Assert.assertEquals(sinks.size(), 2);
        Assert.assertTrue(sinks.get(0) instanceof ConsoleTraceLogSink);
        Assert.assertTrue(sinks.get(1) instanceof FileTraceLogSink);
        sinks.forEach(TraceLogSink::close);
    }

    /**
     * Verifies {@code none} resolves to an empty sink list.
     */
    @Test
    public void resolve_none_returnsEmpty() {
        System.setProperty(TraceSinkFactory.SINKS_PROPERTY, "none");

        List<TraceLogSink> sinks = TraceSinkFactory.resolve();

        Assert.assertTrue(sinks.isEmpty());
    }

    /**
     * Verifies unknown sink names are ignored.
     */
    @Test
    public void resolve_unknownName_isIgnored() {
        System.setProperty(TraceSinkFactory.SINKS_PROPERTY, "bogus");

        List<TraceLogSink> sinks = TraceSinkFactory.resolve();

        Assert.assertTrue(sinks.isEmpty());
    }
}
