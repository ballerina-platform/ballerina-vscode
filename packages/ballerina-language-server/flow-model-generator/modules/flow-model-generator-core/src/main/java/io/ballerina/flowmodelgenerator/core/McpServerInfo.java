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

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * How an MCP server presents itself: the name and icon a client can show for it.
 * <p>
 * The name comes from the {@code initialize} result's {@code serverInfo}, or the
 * {@code io.modelcontextprotocol/serverInfo} entry of a {@code server/discover} result's {@code _meta}
 * (its {@code title}, else its {@code name}). A server that requires authorization rejects {@code initialize}
 * without a token, so its OAuth protected resource metadata (RFC 9728) supplies {@code resource_name} instead.
 * The icon comes only from that {@code serverInfo}'s {@code icons}; servers that send none get the client's
 * generic MCP icon.
 *
 * @param name a display name for the server, or {@code null} when it states none
 * @param icon an http(s) URL of the server's icon, or {@code null} when it states none
 * @since 2.0.0
 */
public record McpServerInfo(String name, String icon) {

    private static final McpServerInfo EMPTY = new McpServerInfo(null, null);
    private static final Pattern RESOURCE_METADATA = Pattern.compile("resource_metadata=\"([^\"]+)\"");
    private static final String WELL_KNOWN_RESOURCE_METADATA = "/.well-known/oauth-protected-resource";
    private static final String DISCOVER_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

    public static McpServerInfo empty() {
        return EMPTY;
    }

    public boolean isEmpty() {
        return name == null && icon == null;
    }

    /**
     * Reads the server's name and icon from a JSON-RPC {@code initialize} response.
     */
    public static McpServerInfo fromInitializeResponse(JsonObject response) {
        return fromServerInfo(object(object(response, "result"), "serverInfo"));
    }

    /**
     * Reads the server's name and icon from a JSON-RPC {@code server/discover} response, whose result carries
     * them in its {@code _meta}.
     */
    public static McpServerInfo fromDiscoverResponse(JsonObject response) {
        return fromServerInfo(object(object(object(response, "result"), "_meta"), DISCOVER_SERVER_INFO));
    }

    private static McpServerInfo fromServerInfo(JsonObject serverInfo) {
        if (serverInfo == null) {
            return EMPTY;
        }
        String name = Objects.requireNonNullElse(string(serverInfo, "title"), string(serverInfo, "name"));
        return new McpServerInfo(name, icon(serverInfo.get("icons")));
    }

    /**
     * Reads the server's name from its OAuth protected resource metadata (RFC 9728).
     */
    public static McpServerInfo fromResourceMetadata(JsonObject metadata) {
        String name = string(metadata, "resource_name");
        return name == null ? EMPTY : new McpServerInfo(name, null);
    }

    /**
     * Where the server publishes its protected resource metadata: the {@code resource_metadata} parameter of
     * its {@code WWW-Authenticate} challenge, else the well-known location derived from the server URL (RFC
     * 9728, section 3.1). Only a location on the server's own origin is returned, so a challenge cannot send
     * the design-time probe to another host.
     */
    public static String resourceMetadataUrl(String serverUrl, String wwwAuthenticate) {
        URI server = uri(serverUrl);
        if (server == null || server.getHost() == null) {
            return null;
        }
        if (wwwAuthenticate != null) {
            Matcher matcher = RESOURCE_METADATA.matcher(wwwAuthenticate);
            if (matcher.find()) {
                URI advertised = uri(matcher.group(1));
                return advertised != null && sameOrigin(server, advertised) ? advertised.toString() : null;
            }
        }
        String path = server.getRawPath() == null || server.getRawPath().equals("/") ? "" : server.getRawPath();
        String port = server.getPort() == -1 ? "" : ":" + server.getPort();
        return server.getScheme() + "://" + server.getHost() + port + WELL_KNOWN_RESOURCE_METADATA + path;
    }

    private static boolean sameOrigin(URI a, URI b) {
        return Objects.equals(lower(a.getScheme()), lower(b.getScheme()))
                && Objects.equals(lower(a.getHost()), lower(b.getHost()))
                && effectivePort(a) == effectivePort(b);
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() != -1) {
            return uri.getPort();
        }
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String lower(String value) {
        return value == null ? null : value.toLowerCase(Locale.ROOT);
    }

    private static URI uri(String value) {
        try {
            URI uri = new URI(value);
            String scheme = lower(uri.getScheme());
            return "http".equals(scheme) || "https".equals(scheme) ? uri : null;
        } catch (URISyntaxException | NullPointerException e) {
            return null;
        }
    }

    // The first icon with an http(s) source, preferring one that is not tied to a light or dark theme.
    // data: URIs are skipped because the icon is written into the user's source code.
    private static String icon(JsonElement icons) {
        if (icons == null || !icons.isJsonArray()) {
            return null;
        }
        String themed = null;
        for (JsonElement element : (JsonArray) icons) {
            if (!element.isJsonObject()) {
                continue;
            }
            JsonObject icon = element.getAsJsonObject();
            String src = string(icon, "src");
            if (src == null || uri(src) == null) {
                continue;
            }
            if (string(icon, "theme") == null) {
                return src;
            }
            if (themed == null) {
                themed = src;
            }
        }
        return themed;
    }

    private static JsonObject object(JsonObject parent, String key) {
        if (parent == null) {
            return null;
        }
        JsonElement element = parent.get(key);
        return element != null && element.isJsonObject() ? element.getAsJsonObject() : null;
    }

    private static String string(JsonObject parent, String key) {
        if (parent == null) {
            return null;
        }
        JsonElement element = parent.get(key);
        if (element == null || !element.isJsonPrimitive() || !element.getAsJsonPrimitive().isString()) {
            return null;
        }
        String value = element.getAsString().strip();
        return value.isEmpty() ? null : value;
    }
}
