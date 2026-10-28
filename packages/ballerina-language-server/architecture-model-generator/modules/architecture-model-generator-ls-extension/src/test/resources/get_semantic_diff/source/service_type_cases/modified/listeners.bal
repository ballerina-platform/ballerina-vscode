import ballerina/http;
import ballerina/tcp as t;

listener http:Listener httpListener = new (9090);

listener tcpListener = new t:Listener(3000);
