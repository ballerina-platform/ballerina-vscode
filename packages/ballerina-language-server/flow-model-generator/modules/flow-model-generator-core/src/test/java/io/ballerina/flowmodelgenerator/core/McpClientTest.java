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

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * How {@link McpClient#listTools} picks between the modern MCP protocol and the legacy {@code initialize}
 * handshake, against a local server that answers each JSON-RPC method as the test says.
 *
 * @since 2.0.0
 */
public class McpClientTest {

    private static final String TOOLS = "{\"tools\": [{\"name\": \"greet\", \"inputSchema\": {}}]}";

    private FakeServer server;

    @AfterMethod
    public void stopServer() throws IOException {
        if (server != null) {
            server.close();
            server = null;
        }
    }

    @Test
    public void listsToolsOfModernServer() throws IOException {
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.json(200, result("{\"supportedVersions\": [\"2026-07-28\"], "
                    + "\"_meta\": {\"io.modelcontextprotocol/serverInfo\": {\"name\": \"Docs\"}}}"));
            case "tools/list" -> Reply.json(200, result(TOOLS));
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        McpClient.ToolList toolList = McpClient.listTools(server.url(), null, null);
        Assert.assertEquals(toolList.tools().size(), 1);
        Assert.assertEquals(toolList.serverInfo().name(), "Docs");
        Assert.assertEquals(server.methods(), List.of("server/discover", "tools/list"));
    }

    @Test
    public void fallsBackToInitializeWhenDiscoverIsRejected() throws IOException {
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.json(400, error(-32600, "Unsupported MCP-Protocol-Version header"));
            case "initialize" -> Reply.json(200, result("{\"protocolVersion\": \"2025-11-25\", "
                    + "\"serverInfo\": {\"name\": \"Legacy\"}}"));
            case "notifications/initialized" -> Reply.accepted();
            case "tools/list" -> Reply.json(200, result(TOOLS));
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        McpClient.ToolList toolList = McpClient.listTools(server.url(), null, null);
        Assert.assertEquals(toolList.tools().size(), 1);
        Assert.assertEquals(toolList.serverInfo().name(), "Legacy");
        Assert.assertEquals(server.methods(),
                List.of("server/discover", "initialize", "notifications/initialized", "tools/list"));
    }

    @Test
    public void fallsBackToInitializeForLegacyVersionsOnly() throws IOException {
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.json(400, "{\"jsonrpc\": \"2.0\", \"id\": 1, \"error\": "
                    + "{\"code\": -32022, \"message\": \"Unsupported protocol version\", "
                    + "\"data\": {\"supported\": [\"2025-11-25\", \"2025-06-18\"]}}}");
            case "initialize" -> Reply.json(200, result("{\"serverInfo\": {\"name\": \"Legacy\"}}"));
            case "notifications/initialized" -> Reply.accepted();
            case "tools/list" -> Reply.json(200, result(TOOLS));
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        Assert.assertEquals(McpClient.listTools(server.url(), null, null).serverInfo().name(), "Legacy");
    }

    @Test
    public void fallsBackToInitializeForAnErrorCodeThatIsNotANumber() throws IOException {
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.json(200,
                    "{\"jsonrpc\": \"2.0\", \"id\": 1, \"error\": {\"code\": \"unknown\", \"message\": \"no\"}}");
            case "initialize" -> Reply.json(200, result("{\"serverInfo\": {\"name\": \"Legacy\"}}"));
            case "notifications/initialized" -> Reply.accepted();
            case "tools/list" -> Reply.json(200, result(TOOLS));
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        Assert.assertEquals(McpClient.listTools(server.url(), null, null).serverInfo().name(), "Legacy");
    }

    @Test
    public void fallsBackToInitializeForAResultWithoutVersions() throws IOException {
        // A legacy server that answers every method it does not know with an empty result
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.json(200, result("{}"));
            case "initialize" -> Reply.json(200, result("{\"serverInfo\": {\"name\": \"Legacy\"}}"));
            case "notifications/initialized" -> Reply.accepted();
            case "tools/list" -> Reply.json(200, result(TOOLS));
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        Assert.assertEquals(McpClient.listTools(server.url(), null, null).serverInfo().name(), "Legacy");
    }

    @Test
    public void rejectsAModernServerWithNoKnownProtocolVersion() throws IOException {
        server = new FakeServer(method -> Reply.json(200, result("{\"supportedVersions\": [\"2030-01-01\"]}")));
        IOException e = Assert.expectThrows(IOException.class, () -> McpClient.listTools(server.url(), null, null));
        Assert.assertTrue(e.getMessage().contains("no supported MCP protocol version"), e.getMessage());
    }

    @Test
    public void rejectsAServerWithNoKnownProtocolVersion() throws IOException {
        server = new FakeServer(method -> Reply.json(400, "{\"jsonrpc\": \"2.0\", \"id\": 1, \"error\": "
                + "{\"code\": -32022, \"message\": \"Unsupported protocol version\", "
                + "\"data\": {\"supported\": [\"2030-01-01\"]}}}"));
        IOException e = Assert.expectThrows(IOException.class, () -> McpClient.listTools(server.url(), null, null));
        Assert.assertTrue(e.getMessage().contains("known MCP protocol version"), e.getMessage());
    }

    @Test
    public void readsAnErrorSentAsAnEventStream() throws IOException {
        server = new FakeServer(method -> Reply.eventStream(400, "{\"jsonrpc\": \"2.0\", \"id\": 1, \"error\": "
                + "{\"code\": -32022, \"message\": \"Unsupported protocol version\", "
                + "\"data\": {\"supported\": [\"2030-01-01\"]}}}"));
        IOException e = Assert.expectThrows(IOException.class, () -> McpClient.listTools(server.url(), null, null));
        Assert.assertTrue(e.getMessage().contains("known MCP protocol version"), e.getMessage());
        Assert.assertEquals(server.methods(), List.of("server/discover"));
    }

    @Test
    public void fallsBackToInitializeWhenDiscoverIsRejectedWithoutABody() throws IOException {
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> new Reply(400, null, "", null, false);
            case "initialize" -> Reply.json(200, result("{\"serverInfo\": {\"name\": \"Legacy\"}}"));
            case "notifications/initialized" -> Reply.accepted();
            case "tools/list" -> Reply.json(200, result(TOOLS));
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        Assert.assertEquals(McpClient.listTools(server.url(), null, null).serverInfo().name(), "Legacy");
    }

    @Test
    public void reportsAnAuthorizationChallenge() throws IOException {
        server = new FakeServer(method -> new Reply(401, "application/json", "{}",
                "Bearer resource_metadata=\"http://localhost/.well-known/oauth-protected-resource\"", false));
        McpClient.UnauthorizedException e = Assert.expectThrows(McpClient.UnauthorizedException.class,
                () -> McpClient.listTools(server.url(), null, null));
        Assert.assertTrue(e.wwwAuthenticate().contains("resource_metadata"), e.wwwAuthenticate());
    }

    @Test
    public void reportsAnAuthorizationChallengeToListTools() throws IOException {
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.json(200, result("{\"supportedVersions\": [\"2026-07-28\"]}"));
            case "tools/list" -> new Reply(401, null, "", "Bearer scope=\"tools\"", false);
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        McpClient.UnauthorizedException e = Assert.expectThrows(McpClient.UnauthorizedException.class,
                () -> McpClient.listTools(server.url(), null, null));
        Assert.assertEquals(e.wwwAuthenticate(), "Bearer scope=\"tools\"");
        // A reply without a body is described by its reason phrase
        Assert.assertEquals(e.getMessage(), "HTTP 401: Status");
    }

    @Test(timeOut = 8000)
    public void readsAnEventStreamResponseLeftOpen() throws IOException {
        // Each response is an event stream the server never closes; a reader waiting for its end would time out
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.openStream(result("{\"supportedVersions\": [\"2026-07-28\"]}"));
            case "tools/list" -> Reply.openStream(result(TOOLS));
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        Assert.assertEquals(McpClient.listTools(server.url(), null, null).tools().size(), 1);
    }

    @Test(timeOut = 8000)
    public void readsAnEventWhoseDataSpansSeveralLines() throws IOException {
        // An event may split its data over several data lines, which together make one JSON-RPC response
        server = new FakeServer(method -> switch (method) {
            case "server/discover" -> Reply.openStream("{\"jsonrpc\": \"2.0\", \"id\": 1,\ndata: \"result\": "
                    + "{\"supportedVersions\": [\"2026-07-28\"]}}");
            case "tools/list" -> Reply.openStream("{\"jsonrpc\": \"2.0\",\ndata: \"id\": 1,\ndata: \"result\": "
                    + TOOLS + "}");
            default -> Reply.json(400, error(-32600, "unexpected " + method));
        });
        Assert.assertEquals(McpClient.listTools(server.url(), null, null).tools().size(), 1);
    }

    private static String result(String result) {
        return "{\"jsonrpc\": \"2.0\", \"id\": 1, \"result\": " + result + "}";
    }

    private static String error(int code, String message) {
        return "{\"jsonrpc\": \"2.0\", \"id\": 1, \"error\": {\"code\": " + code + ", \"message\": \"" + message
                + "\"}}";
    }

    /**
     * A response of the fake server.
     *
     * @param status          the HTTP status
     * @param contentType     the content type, or null for none
     * @param body            the body
     * @param wwwAuthenticate the WWW-Authenticate header, or null for none
     * @param leaveOpen       whether to keep the connection open after the body, as an event stream may
     */
    private record Reply(int status, String contentType, String body, String wwwAuthenticate, boolean leaveOpen) {

        static Reply json(int status, String body) {
            return new Reply(status, "application/json", body, null, false);
        }

        static Reply accepted() {
            return new Reply(202, null, "", null, false);
        }

        static Reply eventStream(int status, String message) {
            return new Reply(status, "text/event-stream", "event: message\ndata: " + message + "\n\n", null, false);
        }

        static Reply openStream(String message) {
            return new Reply(200, "text/event-stream", "event: message\ndata: " + message + "\n\n", null, true);
        }
    }

    /**
     * A minimal HTTP server that answers each request by its JSON-RPC method and records the methods it saw.
     */
    private static final class FakeServer implements AutoCloseable {

        private final ServerSocket socket;
        private final Function<String, Reply> replies;
        private final List<String> methods = new ArrayList<>();
        private final List<Socket> connections = new ArrayList<>();
        private final CountDownLatch closed = new CountDownLatch(1);

        FakeServer(Function<String, Reply> replies) throws IOException {
            this.socket = new ServerSocket(0);
            this.replies = replies;
            Thread acceptor = new Thread(this::accept, "mcp-fake-server");
            acceptor.setDaemon(true);
            acceptor.start();
        }

        String url() {
            return "http://localhost:" + socket.getLocalPort() + "/mcp";
        }

        synchronized List<String> methods() {
            return List.copyOf(methods);
        }

        private void accept() {
            while (!socket.isClosed()) {
                try {
                    Socket connection = socket.accept();
                    synchronized (this) {
                        connections.add(connection);
                    }
                    Thread handler = new Thread(() -> handle(connection), "mcp-fake-connection");
                    handler.setDaemon(true);
                    handler.start();
                } catch (IOException e) {
                    return;
                }
            }
        }

        private void handle(Socket connection) {
            try {
                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
                if (reader.readLine() == null) {
                    return;
                }
                int contentLength = 0;
                String header;
                while ((header = reader.readLine()) != null && !header.isEmpty()) {
                    if (header.toLowerCase(Locale.ROOT).startsWith("content-length:")) {
                        contentLength = Integer.parseInt(header.substring("content-length:".length()).trim());
                    }
                }
                char[] body = new char[contentLength];
                int read = 0;
                while (read < contentLength) {
                    int count = reader.read(body, read, contentLength - read);
                    if (count < 0) {
                        break;
                    }
                    read += count;
                }
                JsonObject request = JsonParser.parseString(new String(body, 0, read)).getAsJsonObject();
                String method = request.get("method").getAsString();
                synchronized (this) {
                    methods.add(method);
                }
                write(connection, replies.apply(method));
            } catch (IOException | RuntimeException e) {
                // The client went away
            }
        }

        private void write(Socket connection, Reply reply) throws IOException {
            byte[] body = reply.body().getBytes(StandardCharsets.UTF_8);
            StringBuilder head = new StringBuilder("HTTP/1.1 ").append(reply.status()).append(" Status\r\n");
            if (reply.contentType() != null) {
                head.append("Content-Type: ").append(reply.contentType()).append("\r\n");
            }
            if (reply.wwwAuthenticate() != null) {
                head.append("WWW-Authenticate: ").append(reply.wwwAuthenticate()).append("\r\n");
            }
            if (reply.leaveOpen()) {
                // No length: the body runs until the connection closes, which it does not
                head.append("Cache-Control: no-cache\r\n\r\n");
            } else {
                head.append("Content-Length: ").append(body.length).append("\r\nConnection: close\r\n\r\n");
            }
            OutputStream out = connection.getOutputStream();
            out.write(head.toString().getBytes(StandardCharsets.UTF_8));
            out.write(body);
            out.flush();
            if (reply.leaveOpen()) {
                try {
                    closed.await(30, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            connection.close();
        }

        @Override
        public void close() throws IOException {
            closed.countDown();
            socket.close();
            synchronized (this) {
                for (Socket connection : connections) {
                    connection.close();
                }
            }
        }
    }
}
