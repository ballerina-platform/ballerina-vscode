import ballerina/http;

listener http:Listener httpListener = new (9090);

// Pre-baked HTTP service (per the e2e-writer rule that scenarios must not
// modify Ballerina sources at runtime): already-defined service + resource so
// the test can open the project and go straight to Try It, without an
// authoring step to create it.
service / on httpListener {
    resource function get greeting() returns json {
        return {message: "Hello, Ballerina!"};
    }

    resource function get greeting/[string name]() returns json {
        return {message: "Hello, " + name + "!"};
    }

    resource function get search(string q) returns json {
        return {query: q};
    }

    resource function get secure(@http:Header {name: "X-Api-Key"} string apiKey) returns json {
        return {header: apiKey};
    }

    resource function post echo(@http:Payload record {|string message;|} payload) returns json {
        return {echoed: payload.message};
    }
}
