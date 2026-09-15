import ballerina/grpc;
import ballerina/http;

// The shape of a real project, and the regression behind wso2/product-integrator#2172: ballerina/http is indexed
// with 330 types, far more than a page holds, while grpc is absent from the index. If the live-compiled pool is
// only offered the slots the indexed pool leaves over, http fills every page on its own and grpc's types don't
// appear until roughly page 17 - the reported symptom, with the fallback in place but unreachable.
function useBothModules(grpc:Error grpcError, http:Request request) returns string {
    return grpcError.message() + request.rawPath;
}
