import ballerina/ai;
import ballerina/http;

listener http:Listener defaultListener = http:getDefaultListener();

listener ai:Listener agentChatListener = new (listenOn = check http:getDefaultListener());
