import ballerinax/solace.jms;

listener jms:Listener solaceJmsListener = new ("smf://localhost:55555", messageVpn = "default");

service jms:Service on solaceJmsListener {
    remote function onMessage(jms:Message message) returns error? {
    }
}
