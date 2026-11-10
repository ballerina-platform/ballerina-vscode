/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.StringJoiner;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * Client for sending requests to the MCP service.
 *
 * @since 1.1.0
 */
public class McpClient {

    private static final Integer CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
    private static final Integer READ_TIMEOUT_MS = 10000; // 10 seconds

    // Protocol revisions known to the mcp.v2 client, newest first
    private static final List<String> MODERN_PROTOCOL_VERSIONS = List.of("2026-07-28");
    private static final List<String> LEGACY_PROTOCOL_VERSIONS =
            List.of("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07");
    private static final String SERVER_DISCOVER_METHOD = "server/discover";
    private static final String TOOLS_LIST_METHOD = "tools/list";
    private static final int MODERN_DISCOVER_REQUEST_ID = 1;
    // Bounds the pages read from a server that keeps offering a next cursor
    private static final int MAX_TOOL_LIST_PAGES = 100;
    private static final int HEADER_MISMATCH = -32020;
    private static final int MISSING_REQUIRED_CLIENT_CAPABILITY = -32021;
    private static final int UNSUPPORTED_PROTOCOL_VERSION = -32022;

    /**
     * Secure socket configuration for SSL/TLS connections.
     *
     * @param certPath     Path to the CA certificate or truststore file
     * @param certPassword Password for the truststore (if .p12/.jks)
     * @param keyPath      Path to the client certificate/key file (for mTLS)
     * @param keyPassword  Password for the client key/keystore
     * @param insecure     If true, skip all certificate verification
     */
    public record SslConfig(String certPath, String certPassword, String keyPath, String keyPassword,
                            boolean insecure) {
    }

    private static void applySslConfig(HttpURLConnection conn, SslConfig sslConfig) throws IOException {
        if (sslConfig == null || !(conn instanceof HttpsURLConnection httpsConn)) {
            return;
        }

        try {
            if (sslConfig.insecure()) {
                TrustManager[] trustAllCerts = new TrustManager[]{
                        new X509TrustManager() {
                            public X509Certificate[] getAcceptedIssuers() {
                                return new X509Certificate[0];
                            }

                            public void checkClientTrusted(X509Certificate[] certs, String authType) {
                            }

                            public void checkServerTrusted(X509Certificate[] certs, String authType) {
                            }
                        }
                };
                SSLContext sslContext = SSLContext.getInstance("TLS");
                sslContext.init(null, trustAllCerts, new java.security.SecureRandom());
                httpsConn.setSSLSocketFactory(sslContext.getSocketFactory());
                httpsConn.setHostnameVerifier((hostname, session) -> true);
                return;
            }

            javax.net.ssl.KeyManager[] keyManagers = null;
            javax.net.ssl.TrustManager[] trustManagers = null;

            // Load client key for mTLS
            if (sslConfig.keyPath() != null && !sslConfig.keyPath().trim().isEmpty()) {
                KeyStore keyStore = loadKeyStore(sslConfig.keyPath(), sslConfig.keyPassword());
                KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
                kmf.init(keyStore, sslConfig.keyPassword() != null
                        ? sslConfig.keyPassword().toCharArray() : new char[0]);
                keyManagers = kmf.getKeyManagers();
            }

            // Load CA certificate / truststore
            if (sslConfig.certPath() != null && !sslConfig.certPath().trim().isEmpty()) {
                KeyStore trustStore = loadTrustStore(sslConfig.certPath(), sslConfig.certPassword());
                TrustManagerFactory tmf =
                        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
                tmf.init(trustStore);
                trustManagers = tmf.getTrustManagers();
            }

            if (keyManagers != null || trustManagers != null) {
                SSLContext sslContext = SSLContext.getInstance("TLS");
                sslContext.init(keyManagers, trustManagers, new java.security.SecureRandom());
                httpsConn.setSSLSocketFactory(sslContext.getSocketFactory());
            }
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("Failed to configure SSL: " + e.getMessage(), e);
        }
    }

    private static KeyStore loadTrustStore(String path, String password) throws Exception {
        String lowerPath = path.toLowerCase(Locale.ROOT);
        char[] passwordChars = password != null ? password.toCharArray() : new char[0];

        if (lowerPath.endsWith(".p12") || lowerPath.endsWith(".pfx") || lowerPath.endsWith(".jks")) {
            // Load the keystore, then extract all certificates into a new truststore
            // so they are recognized as trustedCertEntry by TrustManagerFactory
            String type = lowerPath.endsWith(".jks") ? "JKS" : "PKCS12";
            KeyStore source = KeyStore.getInstance(type);
            try (FileInputStream fis = new FileInputStream(path)) {
                source.load(fis, passwordChars);
            }

            KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
            trustStore.load(null, null);
            java.util.Enumeration<String> aliases = source.aliases();
            int index = 0;
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                java.security.cert.Certificate cert = source.getCertificate(alias);
                if (cert != null) {
                    trustStore.setCertificateEntry("trust-" + index++, cert);
                }
            }
            return trustStore;
        } else {
            // PEM/CRT format — load certificates directly
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
            trustStore.load(null, null);
            try (FileInputStream fis = new FileInputStream(path)) {
                int index = 0;
                for (java.security.cert.Certificate cert : cf.generateCertificates(fis)) {
                    trustStore.setCertificateEntry("cert-" + index++, cert);
                }
            }
            return trustStore;
        }
    }

    private static KeyStore loadKeyStore(String path, String password) throws Exception {
        String lowerPath = path.toLowerCase(Locale.ROOT);
        char[] passwordChars = password != null ? password.toCharArray() : new char[0];

        String type;
        if (lowerPath.endsWith(".p12") || lowerPath.endsWith(".pfx")) {
            type = "PKCS12";
        } else if (lowerPath.endsWith(".jks")) {
            type = "JKS";
        } else {
            throw new IllegalArgumentException(
                    "Unsupported key file format: " + path +
                            ". Client key must be a keystore file (.p12, .pfx, or .jks)");
        }

        KeyStore keyStore = KeyStore.getInstance(type);
        try (FileInputStream fis = new FileInputStream(path)) {
            keyStore.load(fis, passwordChars);
        }
        return keyStore;
    }

    /**
     * The outcome of the {@code initialize} handshake: the session to use for later requests and how the server
     * presents itself.
     *
     * @param sessionId  the {@code mcp-session-id} the server assigned, or {@code null} for a stateless server
     * @param serverInfo the server's name and icon
     */
    public record InitializeResult(String sessionId, McpServerInfo serverInfo) {
    }

    /**
     * Thrown when the server answers a request with 401 Unauthorized. It carries the server's
     * {@code WWW-Authenticate} challenge, which points at the metadata that still names the server.
     */
    public static class UnauthorizedException extends IOException {

        private final String wwwAuthenticate;

        public UnauthorizedException(String message, String wwwAuthenticate) {
            super(message);
            this.wwwAuthenticate = wwwAuthenticate;
        }

        public String wwwAuthenticate() {
            return wwwAuthenticate;
        }
    }

    public static String sendInitializeRequest(String serviceUrl, String accessToken) throws IOException {
        return sendInitializeRequest(serviceUrl, accessToken, null);
    }

    public static String sendInitializeRequest(String serviceUrl, String accessToken, SslConfig sslConfig)
            throws IOException {
        return initialize(serviceUrl, accessToken, sslConfig).sessionId();
    }

    public static InitializeResult initialize(String serviceUrl, String accessToken, SslConfig sslConfig)
            throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = URI.create(serviceUrl).toURL();
            conn = (HttpURLConnection) url.openConnection();
            applySslConfig(conn, sslConfig);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json, text/event-stream");

            // Add OAuth bearer token if provided
            if (accessToken != null && !accessToken.trim().isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            }

            conn.setDoOutput(true);
            conn.setConnectTimeout(CONNECTION_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);

            String body = """
                    {
                      "jsonrpc":"2.0",
                      "id":1,
                      "method":"initialize",
                      "params":{
                        "protocolVersion":"2025-11-25",
                        "capabilities":{},
                        "clientInfo":{
                          "name":"MCP Client",
                          "version":""
                        }
                      }
                    }
                    """;

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                String errorMessage = readErrorStream(conn);
                String message = "HTTP " + responseCode + ": " +
                        (errorMessage != null ? errorMessage : conn.getResponseMessage());
                if (responseCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
                    throw new UnauthorizedException(message, conn.getHeaderField("WWW-Authenticate"));
                }
                throw new IOException(message);
            }

            Map<String, List<String>> headers = conn.getHeaderFields();
            String sessionId = null;

            for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                if (entry.getKey() != null && entry.getKey().equalsIgnoreCase("mcp-session-id")) {
                    if (!entry.getValue().isEmpty()) {
                        sessionId = entry.getValue().getFirst();
                        break;
                    }
                }
            }

            McpServerInfo serverInfo;
            try {
                JsonObject response = parseJsonRpcMessage(readBody(conn), conn.getContentType());
                serverInfo = response == null ? McpServerInfo.empty() : McpServerInfo.fromInitializeResponse(response);
            } catch (RuntimeException e) {
                // The handshake succeeded; a body the probe cannot read only costs the server's name and icon.
                serverInfo = McpServerInfo.empty();
            }
            return new InitializeResult(sessionId, serverInfo);
        } catch (java.net.MalformedURLException e) {
            throw new IOException("Invalid URL: " + e.getMessage(), e);
        } catch (java.net.UnknownHostException e) {
            throw new IOException("Unknown host: " + e.getMessage(), e);
        } catch (java.net.ConnectException e) {
            throw new IOException("Connection refused: Unable to connect to " + serviceUrl, e);
        } catch (java.net.SocketTimeoutException e) {
            throw new IOException("Connection timeout: Server did not respond in time", e);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    public static void sendInitializedNotification(String serviceUrl, String sessionId, String accessToken)
            throws IOException {
        sendInitializedNotification(serviceUrl, sessionId, accessToken, null);
    }

    public static void sendInitializedNotification(String serviceUrl, String sessionId, String accessToken,
                                                   SslConfig sslConfig) throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = URI.create(serviceUrl).toURL();
            conn = (HttpURLConnection) url.openConnection();
            applySslConfig(conn, sslConfig);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json, text/event-stream");

            if (sessionId != null && !sessionId.trim().isEmpty()) {
                conn.setRequestProperty("mcp-session-id", sessionId);
            }

            // Add OAuth bearer token if provided
            if (accessToken != null && !accessToken.trim().isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            }

            conn.setDoOutput(true);
            conn.setConnectTimeout(CONNECTION_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);

            // Note: This is a notification (no "id" field)
            String body = """
                    {
                      "jsonrpc":"2.0",
                      "method":"notifications/initialized"
                    }
                    """;

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            // Notifications don't expect a meaningful response, just check it didn't fail
            int responseCode = conn.getResponseCode();
            if (responseCode >= 400) {
                String errorMessage = readErrorStream(conn);
                throw new IOException("HTTP " + responseCode + ": " +
                        (errorMessage != null ? errorMessage : conn.getResponseMessage()));
            }

            // Consume any response body to properly close the connection
            try {
                conn.getInputStream().close();
            } catch (IOException ignored) {
                // Response body might be empty, which is fine for a notification
            }
        } catch (java.net.MalformedURLException e) {
            throw new IOException("Invalid URL: " + e.getMessage(), e);
        } catch (java.net.UnknownHostException e) {
            throw new IOException("Unknown host: " + e.getMessage(), e);
        } catch (java.net.ConnectException e) {
            throw new IOException("Connection refused: Unable to connect to " + serviceUrl, e);
        } catch (java.net.SocketTimeoutException e) {
            throw new IOException("Connection timeout: Server did not respond in time", e);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    public static JsonArray sendToolsListRequest(String serviceUrl, String sessionId, String accessToken)
            throws IOException {
        return sendToolsListRequest(serviceUrl, sessionId, accessToken, null);
    }

    public static JsonArray sendToolsListRequest(String serviceUrl, String sessionId, String accessToken,
                                                 SslConfig sslConfig) throws IOException {
        JsonArray tools = new JsonArray();
        String cursor = null;
        for (int page = 0; page < MAX_TOOL_LIST_PAGES; page++) {
            JsonObject result = sendToolsListPageRequest(serviceUrl, sessionId, accessToken, sslConfig, cursor);
            if (result.has("tools") && result.get("tools").isJsonArray()) {
                tools.addAll(result.getAsJsonArray("tools"));
            }
            if (!result.has("nextCursor") || !result.get("nextCursor").isJsonPrimitive()) {
                return tools;
            }
            cursor = result.get("nextCursor").getAsString();
        }
        return tools;
    }

    private static JsonObject sendToolsListPageRequest(String serviceUrl, String sessionId, String accessToken,
                                                       SslConfig sslConfig, String cursor) throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = URI.create(serviceUrl).toURL();
            conn = (HttpURLConnection) url.openConnection();
            applySslConfig(conn, sslConfig);
            // Configure request
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json, text/event-stream");
            conn.setRequestProperty("User-Agent", "ballerina");
            conn.setRequestProperty("Connection", "keep-alive");
            conn.setConnectTimeout(CONNECTION_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);

            if (sessionId != null && !sessionId.trim().isEmpty()) {
                conn.setRequestProperty("mcp-session-id", sessionId);
            }

            // Add OAuth bearer token if provided
            if (accessToken != null && !accessToken.trim().isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            }

            conn.setDoOutput(true);

            JsonObject request = new JsonObject();
            request.addProperty("jsonrpc", "2.0");
            request.addProperty("id", 2);
            request.addProperty("method", TOOLS_LIST_METHOD);
            if (cursor != null) {
                JsonObject params = new JsonObject();
                params.addProperty("cursor", cursor);
                request.add("params", params);
            }

            try (OutputStream os = conn.getOutputStream()) {
                os.write(request.toString().getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                String errorMessage = readErrorStream(conn);
                throw new IOException("HTTP " + responseCode + ": " +
                        (errorMessage != null ? errorMessage : conn.getResponseMessage()));
            }

            JsonObject message = parseJsonRpcMessage(readBody(conn), conn.getContentType());
            if (message != null && message.has("error") && message.get("error").isJsonObject()) {
                throw new IOException("Failed to list tools: " + errorMessage(message.getAsJsonObject("error")));
            }
            return message != null && message.has("result") && message.get("result").isJsonObject()
                    ? message.getAsJsonObject("result") : new JsonObject();
        } catch (java.net.MalformedURLException e) {
            throw new IOException("Invalid URL: " + e.getMessage(), e);
        } catch (java.net.UnknownHostException e) {
            throw new IOException("Unknown host: " + e.getMessage(), e);
        } catch (java.net.ConnectException e) {
            throw new IOException("Connection refused: Unable to connect to " + serviceUrl, e);
        } catch (java.net.SocketTimeoutException e) {
            throw new IOException("Connection timeout: Server did not respond in time", e);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /**
     * Lists the tools of an MCP server of either protocol. Like the auto mode of the mcp.v2 client, the server is
     * probed with {@code server/discover} first, and the legacy {@code initialize} handshake is used only when the
     * probe shows that the server does not support the modern protocol.
     *
     * @param serviceUrl  URL of the MCP server
     * @param accessToken Bearer token to send, or null
     * @param sslConfig   Secure socket configuration, or null
     * @return The tools of the server, and its name and icon from the discovery or {@code initialize} result
     * @throws UnauthorizedException If the server requires authorization the request did not carry
     * @throws IOException           If the server cannot be reached or rejects the requests
     */
    public static ToolList listTools(String serviceUrl, String accessToken, SslConfig sslConfig)
            throws IOException {
        JsonObject discovery = discoverModernServer(serviceUrl, accessToken, sslConfig);
        if (discovery != null) {
            return new ToolList(sendModernToolsListRequests(serviceUrl, accessToken, sslConfig),
                    McpServerInfo.fromDiscoverResponse(discovery));
        }
        InitializeResult initialized = initialize(serviceUrl, accessToken, sslConfig);
        sendInitializedNotification(serviceUrl, initialized.sessionId(), accessToken, sslConfig);
        return new ToolList(sendToolsListRequest(serviceUrl, initialized.sessionId(), accessToken, sslConfig),
                initialized.serverInfo());
    }

    /**
     * The tools of an MCP server and how the server presents itself.
     *
     * @param tools      the tools the server lists
     * @param serverInfo the server's name and icon
     */
    public record ToolList(JsonArray tools, McpServerInfo serverInfo) {
    }

    /**
     * Fetches the server's OAuth protected resource metadata (RFC 9728) to name a server that requires
     * authorization. Returns an empty result when the metadata is missing, unreadable or names nothing.
     */
    public static McpServerInfo fetchResourceMetadataServerInfo(String serviceUrl, String wwwAuthenticate,
                                                                SslConfig sslConfig) {
        String metadataUrl = McpServerInfo.resourceMetadataUrl(serviceUrl, wwwAuthenticate);
        if (metadataUrl == null) {
            return McpServerInfo.empty();
        }
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) URI.create(metadataUrl).toURL().openConnection();
            applySslConfig(conn, sslConfig);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(CONNECTION_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return McpServerInfo.empty();
            }
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                JsonElement metadata = JsonParser.parseReader(reader);
                return metadata.isJsonObject()
                        ? McpServerInfo.fromResourceMetadata(metadata.getAsJsonObject())
                        : McpServerInfo.empty();
            }
        } catch (IOException | RuntimeException e) {
            return McpServerInfo.empty();
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    // Mirrors how the mcp.v2 client decides between the modern protocol and the legacy handshake. Returns the
    // server/discover response of a modern server, or null for a legacy one.
    private static JsonObject discoverModernServer(String serviceUrl, String accessToken, SslConfig sslConfig)
            throws IOException {
        ProtocolResponse response = sendModernRequest(serviceUrl, accessToken, sslConfig, MODERN_DISCOVER_REQUEST_ID,
                SERVER_DISCOVER_METHOD, new JsonObject());
        int statusCode = response.statusCode();
        // An authorization failure or a server error would fail the legacy handshake too
        if (statusCode == HttpURLConnection.HTTP_UNAUTHORIZED) {
            throw new UnauthorizedException(response.httpError(), response.wwwAuthenticate());
        }
        if (statusCode == HttpURLConnection.HTTP_FORBIDDEN
                || statusCode >= HttpURLConnection.HTTP_INTERNAL_ERROR) {
            throw new IOException(response.httpError());
        }

        JsonObject message = response.message();
        if (message != null && message.has("error") && message.get("error").isJsonObject()) {
            JsonObject error = message.getAsJsonObject("error");
            int errorCode = errorCode(error);
            if (errorCode == HEADER_MISMATCH || errorCode == MISSING_REQUIRED_CLIENT_CAPABILITY) {
                throw new IOException("Server rejected the protocol discovery request: " + errorMessage(error));
            }
            if (errorCode == UNSUPPORTED_PROTOCOL_VERSION) {
                JsonArray supportedVersions = error.has("data") && error.get("data").isJsonObject()
                        && error.getAsJsonObject("data").has("supported")
                        && error.getAsJsonObject("data").get("supported").isJsonArray()
                        ? error.getAsJsonObject("data").getAsJsonArray("supported") : null;
                if (supportedVersions != null && !containsVersion(supportedVersions, MODERN_PROTOCOL_VERSIONS)
                        && containsVersion(supportedVersions, LEGACY_PROTOCOL_VERSIONS)) {
                    return null;
                }
                throw new IOException("Server does not support a known MCP protocol version: "
                        + errorMessage(error));
            }
            // Any other JSON-RPC error, such as an unknown method, comes from a legacy server
            return null;
        }

        if (statusCode >= HttpURLConnection.HTTP_OK && statusCode < HttpURLConnection.HTTP_MULT_CHOICE) {
            if (message == null || !message.has("result") || !message.get("result").isJsonObject()) {
                // A response that is not a discovery result comes from a legacy server
                return null;
            }
            JsonObject result = message.getAsJsonObject("result");
            if (!result.has("supportedVersions") || !result.get("supportedVersions").isJsonArray()) {
                // A discovery result always lists its versions, so this comes from a legacy server that answers
                // any method it does not know with an empty result
                return null;
            }
            JsonArray supportedVersions = result.getAsJsonArray("supportedVersions");
            if (containsVersion(supportedVersions, MODERN_PROTOCOL_VERSIONS)) {
                return message;
            }
            if (containsVersion(supportedVersions, LEGACY_PROTOCOL_VERSIONS)) {
                return null;
            }
            throw new IOException("Server lists no supported MCP protocol version");
        }

        if (statusCode == HttpURLConnection.HTTP_BAD_REQUEST || statusCode == HttpURLConnection.HTTP_NOT_FOUND
                || statusCode == HttpURLConnection.HTTP_BAD_METHOD) {
            return null;
        }
        throw new IOException(response.httpError());
    }

    private static JsonArray sendModernToolsListRequests(String serviceUrl, String accessToken,
                                                         SslConfig sslConfig) throws IOException {
        JsonArray tools = new JsonArray();
        String cursor = null;
        for (int page = 0; page < MAX_TOOL_LIST_PAGES; page++) {
            JsonObject params = new JsonObject();
            if (cursor != null) {
                params.addProperty("cursor", cursor);
            }
            ProtocolResponse response = sendModernRequest(serviceUrl, accessToken, sslConfig,
                    MODERN_DISCOVER_REQUEST_ID + page + 1, TOOLS_LIST_METHOD, params);
            if (response.statusCode() == HttpURLConnection.HTTP_UNAUTHORIZED) {
                throw new UnauthorizedException(response.httpError(), response.wwwAuthenticate());
            }
            JsonObject message = response.message();
            if (message != null && message.has("error") && message.get("error").isJsonObject()) {
                throw new IOException("Failed to list tools: " + errorMessage(message.getAsJsonObject("error")));
            }
            if (response.statusCode() != HttpURLConnection.HTTP_OK || message == null || !message.has("result")
                    || !message.get("result").isJsonObject()) {
                throw new IOException(response.httpError());
            }
            JsonObject result = message.getAsJsonObject("result");
            if (result.has("tools") && result.get("tools").isJsonArray()) {
                tools.addAll(result.getAsJsonArray("tools"));
            }
            if (!result.has("nextCursor") || !result.get("nextCursor").isJsonPrimitive()) {
                return tools;
            }
            cursor = result.get("nextCursor").getAsString();
        }
        return tools;
    }

    /**
     * Sends a modern protocol request, which carries the protocol version, client info and client capabilities in
     * its {@code _meta}, and repeats the protocol version and the method in its headers.
     */
    private static ProtocolResponse sendModernRequest(String serviceUrl, String accessToken, SslConfig sslConfig,
                                                      int requestId, String method, JsonObject params)
            throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = URI.create(serviceUrl).toURL();
            conn = (HttpURLConnection) url.openConnection();
            applySslConfig(conn, sslConfig);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json, text/event-stream");
            conn.setRequestProperty("MCP-Protocol-Version", MODERN_PROTOCOL_VERSIONS.getFirst());
            conn.setRequestProperty("Mcp-Method", method);
            if (accessToken != null && !accessToken.trim().isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            }
            conn.setDoOutput(true);
            conn.setConnectTimeout(CONNECTION_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);

            JsonObject clientInfo = new JsonObject();
            clientInfo.addProperty("name", "MCP Client");
            clientInfo.addProperty("version", "");
            JsonObject meta = new JsonObject();
            meta.addProperty("io.modelcontextprotocol/protocolVersion", MODERN_PROTOCOL_VERSIONS.getFirst());
            meta.add("io.modelcontextprotocol/clientInfo", clientInfo);
            meta.add("io.modelcontextprotocol/clientCapabilities", new JsonObject());
            JsonObject requestParams = params.deepCopy();
            requestParams.add("_meta", meta);
            JsonObject request = new JsonObject();
            request.addProperty("jsonrpc", "2.0");
            request.addProperty("id", requestId);
            request.addProperty("method", method);
            request.add("params", requestParams);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(request.toString().getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = conn.getResponseCode();
            String body = responseCode < HttpURLConnection.HTTP_BAD_REQUEST
                    ? readBody(conn) : readErrorStream(conn);
            return new ProtocolResponse(responseCode, conn.getResponseMessage(), body,
                    parseJsonRpcMessage(body, conn.getContentType()), conn.getHeaderField("WWW-Authenticate"));
        } catch (java.net.MalformedURLException e) {
            throw new IOException("Invalid URL: " + e.getMessage(), e);
        } catch (java.net.UnknownHostException e) {
            throw new IOException("Unknown host: " + e.getMessage(), e);
        } catch (java.net.ConnectException e) {
            throw new IOException("Connection refused: Unable to connect to " + serviceUrl, e);
        } catch (java.net.SocketTimeoutException e) {
            throw new IOException("Connection timeout: Server did not respond in time", e);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private record ProtocolResponse(int statusCode, String reasonPhrase, String body, JsonObject message,
                                    String wwwAuthenticate) {

        // Describes a failed response by its body, or by its reason phrase when it has no body
        String httpError() {
            return "HTTP " + statusCode + ": " + (body != null && !body.isBlank() ? body : reasonPhrase);
        }
    }

    // Reads a response body. An event stream is read only up to the event that carries the JSON-RPC response, as
    // a server may keep the stream open after it.
    private static String readBody(HttpURLConnection conn) throws IOException {
        boolean eventStream = isEventStream(conn.getContentType());
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder();
            EventData event = new EventData();
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line).append('\n');
                if (eventStream && event.accept(line) != null) {
                    break;
                }
            }
            return body.toString();
        }
    }

    /**
     * Parses the JSON-RPC response in a body, which is either a JSON object or an event stream whose events carry
     * one. Returns null when the body holds no JSON-RPC response.
     */
    private static JsonObject parseJsonRpcMessage(String body, String contentType) {
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            if (isEventStream(contentType)) {
                EventData event = new EventData();
                for (String line : body.split("\n")) {
                    JsonObject response = event.accept(line);
                    if (response != null) {
                        return response;
                    }
                }
                return null;
            }
            JsonElement message = JsonParser.parseString(body);
            return message.isJsonObject() ? message.getAsJsonObject() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static boolean isEventStream(String contentType) {
        return contentType != null && contentType.contains("text/event-stream");
    }

    /**
     * The data of the event-stream event being read. An event may split its data over several {@code data:} lines,
     * so the lines are joined until they hold a whole JSON-RPC response; a blank line ends the event.
     */
    private static final class EventData {

        private final List<String> lines = new ArrayList<>();

        // Takes the next line of the stream, and returns the JSON-RPC response once the event's data holds one
        JsonObject accept(String line) {
            String content = line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
            if (content.isEmpty()) {
                lines.clear();
                return null;
            }
            if (!content.startsWith("data:")) {
                return null;
            }
            String value = content.substring(5);
            lines.add(value.startsWith(" ") ? value.substring(1) : value);
            return response();
        }

        // The JSON-RPC response in the data so far, or null while it is incomplete or is not one, such as a
        // notification
        private JsonObject response() {
            try {
                JsonElement event = JsonParser.parseString(String.join("\n", lines));
                return event.isJsonObject() && (event.getAsJsonObject().has("result")
                        || event.getAsJsonObject().has("error")) ? event.getAsJsonObject() : null;
            } catch (RuntimeException e) {
                return null;
            }
        }
    }

    // The code of a JSON-RPC error, or 0 when it has none that is a number.
    private static int errorCode(JsonObject error) {
        JsonElement code = error.get("code");
        return code != null && code.isJsonPrimitive() && code.getAsJsonPrimitive().isNumber() ? code.getAsInt() : 0;
    }

    private static boolean containsVersion(JsonArray versions, List<String> knownVersions) {
        for (JsonElement version : versions) {
            if (version.isJsonPrimitive() && knownVersions.contains(version.getAsString())) {
                return true;
            }
        }
        return false;
    }

    private static String errorMessage(JsonObject error) {
        return error.has("message") ? error.get("message").getAsString() : error.toString();
    }

    // Reads an error body, or returns null when there is none. Lines are kept apart, as an event stream needs them.
    private static String readErrorStream(HttpURLConnection conn) {
        InputStream errorStream = conn.getErrorStream();
        if (errorStream == null) {
            return null;
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(errorStream, StandardCharsets.UTF_8))) {
            StringJoiner errorResponse = new StringJoiner("\n");
            String line;
            while ((line = reader.readLine()) != null) {
                errorResponse.add(line);
            }
            return errorResponse.toString();
        } catch (IOException e) {
            return null;
        }
    }
}
