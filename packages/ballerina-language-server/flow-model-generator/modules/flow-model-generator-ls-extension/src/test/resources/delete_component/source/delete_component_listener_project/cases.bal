import ballerina/http;

listener http:Listener sameFileListener = new (9201);

public listener http:Listener exportedListener = new (9202);

listener http:Listener referencedListener = new (9203);

listener http:Listener annotatedListener = new (9204);

listener http:Listener twiceListener = new (9205);

service /sameFile on sameFileListener {
    resource function get hello() returns string {
        return "sameFile";
    }
}

service /exported on exportedListener {
    resource function get hello() returns string {
        return "exported";
    }
}

service /referenced on referencedListener {
    resource function get hello() returns string {
        return "referenced";
    }
}

function stopReferenced() returns error? {
    check referencedListener.gracefulStop();
}

@http:ServiceConfig {cors: {allowOrigins: ["*"]}}
service /annotated on annotatedListener {
    resource function get hello() returns string {
        return "annotated";
    }
}

service /twice on twiceListener, twiceListener {
    resource function get hello() returns string {
        return "twice";
    }
}

service /stale on staleFileListener {
    resource function get hello() returns string {
        return "stale";
    }
}
