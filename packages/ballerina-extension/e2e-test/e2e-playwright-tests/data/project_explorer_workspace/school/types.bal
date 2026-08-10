import ballerinax/kafka;

public type ValueSchema record {|
    string name1;
|};

type KafkaAnydataConsumer record {|
    *kafka:AnydataConsumerRecord;
    ValueSchema value;
|};
