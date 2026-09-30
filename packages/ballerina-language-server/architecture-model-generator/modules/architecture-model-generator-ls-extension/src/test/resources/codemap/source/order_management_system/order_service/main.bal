import wso2/order_service.db;
import wso2/order_service.messaging;
import ballerina/log;
import ballerina/lang.runtime as runtime;

public function main() {
    log:printInfo("Order Service starting up...", port = SERVICE_PORT);

    runtime:onGracefulStop(function () {
        log:printInfo("Shutting down Order Service...");
        checkpanic db:closeClient();
        checkpanic messaging:closeProducer();
        log:printInfo("Shutdown complete.");
    });
}
