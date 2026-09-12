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

import com.google.gson.Gson;
import com.google.gson.annotations.SerializedName;
import com.google.gson.reflect.TypeToken;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The pinned {@code org/package/module/version} for every connector the schema-driven trigger tests
 * exercise against the live generated (L1 + semantic facts + L2) tier, replacing the per-test bare
 * module-name literals and the retired bundled-fixture registry as the shared source of truth.
 */
final class GeneratedTriggerCorpus {

    private static final Gson GSON = new Gson();
    private static final String CORPUS_RESOURCE = "generated-trigger-corpus.json";

    private static final Map<String, Entry> BY_KEY = load();

    private GeneratedTriggerCorpus() {
    }

    record Entry(String key, String org, @SerializedName("package") String packageName, String module,
                 String version) {
    }

    static Entry get(String key) {
        Entry entry = BY_KEY.get(key);
        if (entry == null) {
            throw new IllegalArgumentException(key + " is not in " + CORPUS_RESOURCE);
        }
        return entry;
    }

    static List<Entry> all() {
        return List.copyOf(BY_KEY.values());
    }

    private static Map<String, Entry> load() {
        try (InputStream is = GeneratedTriggerCorpus.class.getClassLoader().getResourceAsStream(CORPUS_RESOURCE)) {
            if (is == null) {
                throw new IllegalStateException("missing classpath resource " + CORPUS_RESOURCE);
            }
            Type type = new TypeToken<List<Entry>>() { }.getType();
            try (InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                List<Entry> entries = GSON.fromJson(reader, type);
                return (entries == null ? List.<Entry>of() : entries).stream()
                        .collect(Collectors.toMap(Entry::key, entry -> entry));
            }
        } catch (IOException e) {
            throw new UncheckedIOException("failed reading " + CORPUS_RESOURCE, e);
        }
    }
}
