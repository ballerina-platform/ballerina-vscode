import ballerina/ai;

ai:Wso2ModelProvider typedModelProvider = check new ("http://localhost:9090", "test-token");
ai:ModelProvider genericModelProvider = typedModelProvider;
ai:InMemoryShortTermMemoryStore memoryStoreVar = check new ();

function fallbackModelExpression() returns ai:ModelProvider => typedModelProvider;

function referenceTypedModelProvider() returns ai:ModelProvider => typedModelProvider;

function referenceGenericModelProvider() returns ai:ModelProvider => genericModelProvider;

function referenceFallbackModelExpression() returns ai:ModelProvider => fallbackModelExpression();

function memoryWithNoStore() returns ai:ShortTermMemory|error => check new ai:ShortTermMemory();

function memoryWithPositionalStore() returns ai:ShortTermMemory|error => check new ai:ShortTermMemory(memoryStoreVar);

function memoryWithNamedStore() returns ai:ShortTermMemory|error =>
    check new ai:ShortTermMemory(store = memoryStoreVar);

class MemoryHolder {
    private final ai:ShortTermMemoryStore fieldStore;
    private final ai:ModelProvider fieldModel;

    function init() returns error? {
        self.fieldStore = check new ai:InMemoryShortTermMemoryStore();
        self.fieldModel = typedModelProvider;
    }

    function referenceFieldModel() returns ai:ModelProvider => self.fieldModel;

    function memoryWithFieldStore() returns ai:ShortTermMemory|error =>
        check new ai:ShortTermMemory(store = self.fieldStore);
}
