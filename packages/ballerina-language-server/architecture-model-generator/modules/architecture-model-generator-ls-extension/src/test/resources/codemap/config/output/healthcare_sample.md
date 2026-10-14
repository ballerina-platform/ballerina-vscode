# healthcare_sample - High Level Codebase Overview

---

## File Path: encounter_api_config.bal

```ballerina
import ballerinax/health.fhir.r4 [L:22 - L:22]
```

```ballerina
final r4:ResourceAPIConfig encounterApiConfig [L:24 - L:108]
```

---

## File Path: mapping.bal

```ballerina
import healthcare_sample.db [L:17 - L:17]
import ballerina/uuid [L:19 - L:19]
import ballerinax/health.fhir.r4.uscore311 [L:20 - L:20]
```

```ballerina
isolated int currentId [L:67 - L:67]
```

```ballerina
public isolated function mapCustomPatientToFHIR(db:PatientDataOptionalized patient) returns uscore311:USCorePatientProfile [L:26 - L:41]
public isolated function mapFhirToCustomPatient(uscore311:USCorePatientProfile patient) returns db:PatientDataInsert [L:43 - L:48]
isolated function mapGivenToName(string[]? given) returns string [L:53 - L:58]
isolated function mapNameToGiven(string? name) returns string[] [L:60 - L:65]
isolated function generatePatientId() returns string [L:69 - L:84]
```

---

## File Path: patient_api_config.bal

```ballerina
import ballerinax/health.fhir.r4 [L:22 - L:22]
```

```ballerina
final r4:ResourceAPIConfig patientApiConfig [L:24 - L:128]
```

---

## File Path: service.bal

```ballerina
import healthcare_sample.db [L:22 - L:22]
import ballerina/http [L:24 - L:24]
import ballerina/log [L:25 - L:25]
import ballerina/persist [L:26 - L:26]
import ballerina/sql [L:27 - L:27]
import ballerinax/health.fhir.r4 [L:28 - L:28]
import ballerinax/health.fhirr4 [L:29 - L:29]
import ballerinax/health.fhir.r4.uscore700 [L:30 - L:30]
```

```ballerina
configurable string SERVER_BASE_URL [L:32 - L:32]
```

```ballerina
final db:Client dbClient [L:34 - L:34]
```

```ballerina
# Generic types to wrap all implemented profiles for each resource.
# Add required profile types here.
public type Patient uscore700:USCorePatientProfile [L:41 - L:43]
public type Encounter uscore700:USCoreEncounterProfile [L:45 - L:45]
```

```ballerina
function init() returns error? [L:37 - L:39]
```

```ballerina
listener http:Listener httpListener [L:47 - L:47]
```

```ballerina
# initialize source system endpoints here
service http:Service /fhir/r4/metadata on httpListener { [L:49 - L:62]
    # The capability statement is a key part of the overall conformance framework in FHIR. It is used as a statement of the
    # features of actual software, or of a set of rules for an application to provide. This statement connects to all the
    # detailed statements of functionality, such as StructureDefinitions and ValueSets. This composite statement of application
    # capability may be used for system compatibility testing, code generation, or as the basis for a conformance assessment.
    # For further information https://hl7.org/fhir/capabilitystatement.html
    # + return - capability statement as a json
    isolated resource function get .() returns r4:CapabilityStatement|error [L:53 - L:61]
}
# Patient API                                                                                                          #
service /fhir/r4/Patient on new fhirr4:Listener(config = patientApiConfig) { [L:64 - L:160]
    isolated resource function get [string id](r4:FHIRContext fhirContext) returns Patient|r4:OperationOutcome|r4:FHIRError [L:68 - L:79]
    isolated resource function get [string id]/_history/[string vid](r4:FHIRContext fhirContext) returns Patient|r4:OperationOutcome|r4:FHIRError [L:82 - L:84]
    isolated resource function get .(r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError [L:87 - L:116]
    isolated resource function post .(r4:FHIRContext fhirContext, Patient patient) returns r4:FHIRError|http:Response [L:119 - L:134]
    isolated resource function put [string id](r4:FHIRContext fhirContext, Patient patient) returns Patient|r4:OperationOutcome|r4:FHIRError [L:137 - L:139]
    isolated resource function patch [string id](r4:FHIRContext fhirContext, json patch) returns Patient|r4:OperationOutcome|r4:FHIRError [L:142 - L:144]
    isolated resource function delete [string id](r4:FHIRContext fhirContext) returns r4:OperationOutcome|r4:FHIRError [L:147 - L:149]
    isolated resource function get [string id]/_history(r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError [L:152 - L:154]
    isolated resource function get _history(r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError [L:157 - L:159]
}
# Encounter API                                                                                                          #
service /fhir/r4/Encounter on new fhirr4:Listener(config = encounterApiConfig) { [L:162 - L:209]
    isolated resource function get [string id](r4:FHIRContext fhirContext) returns Encounter|r4:OperationOutcome|r4:FHIRError [L:166 - L:168]
    isolated resource function get [string id]/_history/[string vid](r4:FHIRContext fhirContext) returns Encounter|r4:OperationOutcome|r4:FHIRError [L:171 - L:173]
    isolated resource function get .(r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError [L:176 - L:178]
    isolated resource function post .(r4:FHIRContext fhirContext, Encounter encounter) returns Encounter|r4:OperationOutcome|r4:FHIRError [L:181 - L:183]
    isolated resource function put [string id](r4:FHIRContext fhirContext, Encounter encounter) returns Encounter|r4:OperationOutcome|r4:FHIRError [L:186 - L:188]
    isolated resource function patch [string id](r4:FHIRContext fhirContext, json patch) returns Encounter|r4:OperationOutcome|r4:FHIRError [L:191 - L:193]
    isolated resource function delete [string id](r4:FHIRContext fhirContext) returns r4:OperationOutcome|r4:FHIRError [L:196 - L:198]
    isolated resource function get [string id]/_history(r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError [L:201 - L:203]
    isolated resource function get _history(r4:FHIRContext fhirContext) returns r4:Bundle|r4:OperationOutcome|r4:FHIRError [L:206 - L:208]
}
```

---

## File Path: modules/db/persist_client.bal

```ballerina
import ballerina/jballerina.java [L:22 - L:22]
import ballerina/persist [L:23 - L:23]
import ballerina/sql [L:24 - L:24]
import ballerinax/mysql [L:25 - L:25]
import ballerinax/mysql.driver as _ [L:26 - L:26]
import ballerinax/persist.sql as psql [L:27 - L:27]
```

```ballerina
const PATIENT_DATA = "patientdata" [L:29 - L:29]
const ENCOUNTER_DATA = "encounterdata" [L:30 - L:30]
```

```ballerina
public isolated client class Client { [L:32 - L:174]
    *persist:AbstractPersistClient; [L:33 - L:33]
    private final mysql:Client dbClient [L:35 - L:35]
    private final map<psql:SQLClient> persistClients [L:37 - L:37]
    private final record {|psql:SQLMetadata...;|} & readonly metadata [L:39 - L:67]
    public isolated function init() returns persist:Error? [L:69 - L:79]
    isolated resource function get patientdata(PatientDataTargetType targetType = <>, sql:ParameterizedQuery whereClause = ``, sql:ParameterizedQuery orderByClause = ``, sql:ParameterizedQuery limitClause = ``, sql:ParameterizedQuery groupByClause = ``) returns stream<targetType, persist:Error?> [L:81 - L:84]
    isolated resource function get patientdata/[string id](PatientDataTargetType targetType = <>) returns targetType|persist:Error [L:86 - L:89]
    isolated resource function post patientdata(PatientDataInsert[] data) returns string[]|persist:Error [L:91 - L:99]
    isolated resource function put patientdata/[string id](PatientDataUpdate value) returns PatientData|persist:Error [L:101 - L:108]
    isolated resource function delete patientdata/[string id]() returns PatientData|persist:Error [L:110 - L:118]
    isolated resource function get encounterdata(EncounterDataTargetType targetType = <>, sql:ParameterizedQuery whereClause = ``, sql:ParameterizedQuery orderByClause = ``, sql:ParameterizedQuery limitClause = ``, sql:ParameterizedQuery groupByClause = ``) returns stream<targetType, persist:Error?> [L:120 - L:123]
    isolated resource function get encounterdata/[string id](EncounterDataTargetType targetType = <>) returns targetType|persist:Error [L:125 - L:128]
    isolated resource function post encounterdata(EncounterDataInsert[] data) returns string[]|persist:Error [L:130 - L:138]
    isolated resource function put encounterdata/[string id](EncounterDataUpdate value) returns EncounterData|persist:Error [L:140 - L:147]
    isolated resource function delete encounterdata/[string id]() returns EncounterData|persist:Error [L:149 - L:157]
    remote isolated function queryNativeSQL(sql:ParameterizedQuery sqlQuery, typedesc<record {}> rowType = <>) returns stream<rowType, persist:Error?> [L:159 - L:161]
    remote isolated function executeNativeSQL(sql:ParameterizedQuery sqlQuery) returns psql:ExecutionResult|persist:Error [L:163 - L:165]
    public isolated function close() returns persist:Error? [L:167 - L:173]
}
```

---

## File Path: modules/db/persist_db_config.bal

```ballerina
import ballerinax/mysql [L:22 - L:22]
```

```ballerina
configurable int port [L:24 - L:24]
configurable string host [L:25 - L:25]
configurable string user [L:26 - L:26]
configurable string database [L:27 - L:27]
configurable string password [L:28 - L:28]
configurable mysql:Options & readonly connectionOptions [L:29 - L:29]
```

---

## File Path: modules/db/persist_types.bal

```ballerina
public type PatientData record [L:22 - L:27]
public type PatientDataOptionalized record [L:29 - L:34]
public type PatientDataTargetType typedesc<PatientDataOptionalized> [L:36 - L:36]
public type PatientDataInsert PatientData [L:38 - L:38]
public type PatientDataUpdate record [L:40 - L:44]
public type EncounterData record [L:46 - L:56]
public type EncounterDataOptionalized record [L:58 - L:68]
public type EncounterDataTargetType typedesc<EncounterDataOptionalized> [L:70 - L:70]
public type EncounterDataInsert EncounterData [L:72 - L:72]
public type EncounterDataUpdate record [L:74 - L:83]
```
