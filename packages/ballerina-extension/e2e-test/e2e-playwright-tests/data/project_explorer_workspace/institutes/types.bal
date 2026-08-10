import ballerinax/rabbitmq;

type ContentSchema record {|
    string name1;
    string name2;
|};

type RabbitMQAnydataMessage record {|
    *rabbitmq:AnydataMessage;
    ContentSchema content;
|};
