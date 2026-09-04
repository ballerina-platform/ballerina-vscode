-- AUTO-GENERATED FILE.

-- This file is an auto-generated file by Ballerina persistence layer for model.
-- Please verify the generated scripts and execute them against the target DB server.

DROP TABLE IF EXISTS `EncounterData`;
DROP TABLE IF EXISTS `PatientData`;

CREATE TABLE `PatientData` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191),
	`gender` VARCHAR(191),
	`birthDate` VARCHAR(191),
	PRIMARY KEY(`id`)
);

CREATE TABLE `EncounterData` (
	`id` VARCHAR(191) NOT NULL,
	`status` VARCHAR(191) NOT NULL,
	`encounterClassSystem` VARCHAR(191),
	`encounterClassCode` VARCHAR(191),
	`encounterClassDisplay` VARCHAR(191),
	`typeText` VARCHAR(191),
	`subjectRef` VARCHAR(191) NOT NULL,
	`periodStart` VARCHAR(191),
	`periodEnd` VARCHAR(191),
	PRIMARY KEY(`id`)
);


