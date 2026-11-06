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
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.List;
import java.util.Locale;
import java.util.Map;

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
     * Thrown when the server answers {@code initialize} with 401 Unauthorized. It carries the server's
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
                JsonObject response = readJsonRpcResponse(conn);
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

            String body = """
                    {
                      "jsonrpc":"2.0",
                      "id":2,
                      "method":"tools/list"
                    }
                    """;

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                String errorMessage = readErrorStream(conn);
                throw new IOException("HTTP " + responseCode + ": " +
                        (errorMessage != null ? errorMessage : conn.getResponseMessage()));
            }

            return extractToolsArrayFromResponse(conn);
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

    private static JsonArray extractToolsArrayFromResponse(HttpURLConnection conn) throws IOException {
        String contentType = conn.getContentType();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {

            if (contentType != null && contentType.contains("text/event-stream")) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("data: ")) {
                        return parseToolsFromJson(line.substring(6));
                    }
                }
            } else {
                StringBuilder fullResponse = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    fullResponse.append(line);
                }
                return parseToolsFromJson(fullResponse.toString());
            }
        }
        return new JsonArray();
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

    // Reads one JSON-RPC response, from a plain JSON body or the first data event of an SSE stream.
    private static JsonObject readJsonRpcResponse(HttpURLConnection conn) throws IOException {
        String contentType = conn.getContentType();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String json = null;
            if (contentType != null && contentType.contains("text/event-stream")) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("data:")) {
                        json = line.substring(5).strip();
                        break;
                    }
                }
            } else {
                StringBuilder fullResponse = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    fullResponse.append(line);
                }
                json = fullResponse.toString();
            }
            if (json == null || json.isBlank()) {
                return null;
            }
            JsonElement element = JsonParser.parseString(json);
            return element.isJsonObject() ? element.getAsJsonObject() : null;
        }
    }

    private static JsonArray parseToolsFromJson(String json) {
        JsonObject response = JsonParser.parseString(json).getAsJsonObject();
        if (response.has("result")) {
            JsonObject result = response.getAsJsonObject("result");
            if (result.has("tools") && result.get("tools").isJsonArray()) {
                return result.getAsJsonArray("tools");
            }
        }
        return new JsonArray();
    }

    private static String readErrorStream(HttpURLConnection conn) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
            StringBuilder errorResponse = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                errorResponse.append(line);
            }
            return errorResponse.toString();
        } catch (IOException e) {
            return null;
        }
    }
}
