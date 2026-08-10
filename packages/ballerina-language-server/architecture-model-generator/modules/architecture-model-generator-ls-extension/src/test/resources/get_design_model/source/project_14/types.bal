type OrderInput record {|
    string orderId;
|};

type PaymentData record {|
    string method;
    decimal amount;
|};

type OrderEvents record {|
    future<PaymentData> paymentReceived;
    future<string> shipmentReady;
|};
