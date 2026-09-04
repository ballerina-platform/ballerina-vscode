import ballerina/grpc;

// ballerina/grpc is resolvable from the distribution but absent from the shipped search index, so its types are
// only reachable through the live-compilation fallback.
function useLiveType(grpc:Error err) returns string {
    return err.message();
}
