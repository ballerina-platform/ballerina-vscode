# shopify_stripe_integration - High Level Codebase Overview

---

## File Path: agents.bal

---

## File Path: automation.bal

---

## File Path: config.bal

```ballerina
configurable record {
    string apiSecretKey;
} shopifyConfig [L:1 - L:3]
configurable record {
    string secretKey;
} stripeConfig [L:5 - L:7]
```

---

## File Path: connections.bal

```ballerina
import ballerinax/trigger.shopify [L:1 - L:1]
import ballerinax/stripe [L:2 - L:2]
```

```ballerina
shopifyListenerConfig listenerConfig [L:4 - L:6]
stripe:ConnectionConfig configuration [L:10 - L:14]
stripe:Client stripe [L:16 - L:16]
```

```ballerina
listener shopify:Listener shopifyListener [L:8 - L:8]
```

---

## File Path: data_mappings.bal

---

## File Path: functions.bal

---

## File Path: main.bal

```ballerina
// [Parser Error] invalid token 'remotee' [L:19 - L:19]
remotee function onCustomersDisable(shopify:CustomerEvent event) returns error? {
```

```ballerina
import ballerinax/trigger.shopify [L:1 - L:1]
import ballerinax/stripe [L:2 - L:2]
import ballerina/log [L:3 - L:3]
```

---

## File Path: types.bal
