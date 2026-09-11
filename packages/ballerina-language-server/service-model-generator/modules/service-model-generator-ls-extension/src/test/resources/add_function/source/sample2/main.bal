import ballerinax/kafka;

listener kafka:Listener kafkaListener = new ("localhost:9092", topics = "myTopic");

service kafka:Service on kafkaListener {

}
