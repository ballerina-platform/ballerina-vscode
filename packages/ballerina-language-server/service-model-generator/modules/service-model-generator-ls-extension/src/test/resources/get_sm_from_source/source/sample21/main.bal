import ballerina/grpc;

listener grpc:Listener grpcListener = new (8989);

@grpc:Descriptor {
    value: "0A0A68656C6C6F2E70726F746F"
}
@grpc:ServiceConfig {
    auth: []
}
service grpc:Service "HelloWorld" on grpcListener {
}
