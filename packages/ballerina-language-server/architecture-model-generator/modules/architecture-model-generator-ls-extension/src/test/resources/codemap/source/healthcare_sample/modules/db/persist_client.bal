// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

// AUTO-GENERATED FILE. DO NOT MODIFY.

// This file is an auto-generated file by Ballerina persistence layer for model.
// It should not be modified by hand.

import ballerina/jballerina.java;
import ballerina/persist;
import ballerina/sql;
import ballerinax/mysql;
import ballerinax/mysql.driver as _;
import ballerinax/persist.sql as psql;

const PATIENT_DATA = "patientdata";
const ENCOUNTER_DATA = "encounterdata";

public isolated client class Client {
    *persist:AbstractPersistClient;

    private final mysql:Client dbClient;

    private final map<psql:SQLClient> persistClients;

    private final record {|psql:SQLMetadata...;|} & readonly metadata = {
        [PATIENT_DATA]: {
            entityName: "PatientData",
            tableName: "PatientData",
            fieldMetadata: {
                id: {columnName: "id"},
                name: {columnName: "name"},
                gender: {columnName: "gender"},
                birthDate: {columnName: "birthDate"}
            },
            keyFields: ["id"]
        },
        [ENCOUNTER_DATA]: {
            entityName: "EncounterData",
            tableName: "EncounterData",
            fieldMetadata: {
                id: {columnName: "id"},
                status: {columnName: "status"},
                encounterClassSystem: {columnName: "encounterClassSystem"},
                encounterClassCode: {columnName: "encounterClassCode"},
                encounterClassDisplay: {columnName: "encounterClassDisplay"},
                typeText: {columnName: "typeText"},
                subjectRef: {columnName: "subjectRef"},
                periodStart: {columnName: "periodStart"},
                periodEnd: {columnName: "periodEnd"}
            },
            keyFields: ["id"]
        }
    };

    public isolated function init() returns persist:Error? {
        mysql:Client|error dbClient = new (host = host, user = user, password = password, database = database, port = port, options = connectionOptions);
        if dbClient is error {
            return <persist:Error>error(dbClient.message());
        }
        self.dbClient = dbClient;
        self.persistClients = {
            [PATIENT_DATA]: check new (dbClient, self.metadata.get(PATIENT_DATA), psql:MYSQL_SPECIFICS),
            [ENCOUNTER_DATA]: check new (dbClient, self.metadata.get(ENCOUNTER_DATA), psql:MYSQL_SPECIFICS)
        };
    }

    isolated resource function get patientdata(PatientDataTargetType targetType = <>, sql:ParameterizedQuery whereClause = ``, sql:ParameterizedQuery orderByClause = ``, sql:ParameterizedQuery limitClause = ``, sql:ParameterizedQuery groupByClause = ``) returns stream<targetType, persist:Error?> = @java:Method {
        'class: "io.ballerina.stdlib.persist.sql.datastore.MySQLProcessor",
        name: "query"
    } external;

    isolated resource function get patientdata/[string id](PatientDataTargetType targetType = <>) returns targetType|persist:Error = @java:Method {
        'class: "io.ballerina.stdlib.persist.sql.datastore.MySQLProcessor",
        name: "queryOne"
    } external;

    isolated resource function post patientdata(PatientDataInsert[] data) returns string[]|persist:Error {
        psql:SQLClient sqlClient;
        lock {
            sqlClient = self.persistClients.get(PATIENT_DATA);
        }
        _ = check sqlClient.runBatchInsertQuery(data);
        return from PatientDataInsert inserted in data
            select inserted.id;
    }

    isolated resource function put patientdata/[string id](PatientDataUpdate value) returns PatientData|persist:Error {
        psql:SQLClient sqlClient;
        lock {
            sqlClient = self.persistClients.get(PATIENT_DATA);
        }
        _ = check sqlClient.runUpdateQuery(id, value);
        return self->/patientdata/[id].get();
    }

    isolated resource function delete patientdata/[string id]() returns PatientData|persist:Error {
        PatientData result = check self->/patientdata/[id].get();
        psql:SQLClient sqlClient;
        lock {
            sqlClient = self.persistClients.get(PATIENT_DATA);
        }
        _ = check sqlClient.runDeleteQuery(id);
        return result;
    }

    isolated resource function get encounterdata(EncounterDataTargetType targetType = <>, sql:ParameterizedQuery whereClause = ``, sql:ParameterizedQuery orderByClause = ``, sql:ParameterizedQuery limitClause = ``, sql:ParameterizedQuery groupByClause = ``) returns stream<targetType, persist:Error?> = @java:Method {
        'class: "io.ballerina.stdlib.persist.sql.datastore.MySQLProcessor",
        name: "query"
    } external;

    isolated resource function get encounterdata/[string id](EncounterDataTargetType targetType = <>) returns targetType|persist:Error = @java:Method {
        'class: "io.ballerina.stdlib.persist.sql.datastore.MySQLProcessor",
        name: "queryOne"
    } external;

    isolated resource function post encounterdata(EncounterDataInsert[] data) returns string[]|persist:Error {
        psql:SQLClient sqlClient;
        lock {
            sqlClient = self.persistClients.get(ENCOUNTER_DATA);
        }
        _ = check sqlClient.runBatchInsertQuery(data);
        return from EncounterDataInsert inserted in data
            select inserted.id;
    }

    isolated resource function put encounterdata/[string id](EncounterDataUpdate value) returns EncounterData|persist:Error {
        psql:SQLClient sqlClient;
        lock {
            sqlClient = self.persistClients.get(ENCOUNTER_DATA);
        }
        _ = check sqlClient.runUpdateQuery(id, value);
        return self->/encounterdata/[id].get();
    }

    isolated resource function delete encounterdata/[string id]() returns EncounterData|persist:Error {
        EncounterData result = check self->/encounterdata/[id].get();
        psql:SQLClient sqlClient;
        lock {
            sqlClient = self.persistClients.get(ENCOUNTER_DATA);
        }
        _ = check sqlClient.runDeleteQuery(id);
        return result;
    }

    remote isolated function queryNativeSQL(sql:ParameterizedQuery sqlQuery, typedesc<record {}> rowType = <>) returns stream<rowType, persist:Error?> = @java:Method {
        'class: "io.ballerina.stdlib.persist.sql.datastore.MySQLProcessor"
    } external;

    remote isolated function executeNativeSQL(sql:ParameterizedQuery sqlQuery) returns psql:ExecutionResult|persist:Error = @java:Method {
        'class: "io.ballerina.stdlib.persist.sql.datastore.MySQLProcessor"
    } external;

    public isolated function close() returns persist:Error? {
        error? result = self.dbClient.close();
        if result is error {
            return <persist:Error>error(result.message());
        }
        return result;
    }
}

