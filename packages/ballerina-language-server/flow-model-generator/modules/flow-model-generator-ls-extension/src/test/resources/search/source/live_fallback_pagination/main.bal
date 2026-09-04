import ballerina/grpc;
import ballerina/os;

// os is indexed (5 types) while grpc is not, so the two share one pagination window: each page draws from both,
// and paging to the end must show every row of each exactly once.
function useTypes(grpc:Error grpcError, os:Error osError) returns [string, string] {
    return [grpcError.message(), osError.message()];
}
