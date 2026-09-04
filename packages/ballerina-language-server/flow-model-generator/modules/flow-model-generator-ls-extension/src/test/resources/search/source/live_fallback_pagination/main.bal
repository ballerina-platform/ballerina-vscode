import ballerina/grpc;
import ballerina/os;

// os is indexed (5 types) while grpc is not, so a page past the indexed pool's capacity must continue from the
// live-compiled pool without dropping rows.
function useTypes(grpc:Error grpcError, os:Error osError) returns [string, string] {
    return [grpcError.message(), osError.message()];
}
