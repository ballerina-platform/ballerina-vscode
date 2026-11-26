import configServiceProject.hello_world;
import ballerina/http;

configurable boolean isAdmin = ?;
configurable string url = ?;
configurable http:ClientAuthConfig authConfig = ?;

service on new http:Listener(0) {
    function init() returns error? {
        float barValue = hello_world:bar;
        http:Client myClient = check new (url, {
            auth: authConfig
        });
    }

}
