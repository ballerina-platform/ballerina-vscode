/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import debounce from "lodash/debounce";
import { TextField } from "@wso2/ui-toolkit";
import { FieldGroup, SectionDivider } from "./styles";
import { AdvancedConfigurationSection } from "./components";
import { Organization } from "./components/AdvancedConfigurationSection";
import { AddProjectFormData } from "./types";
import { useProductTerms } from "./useProductTerms";
import { useBiWsContext } from "../wsManager/WsClientContext";
import {
    checkNameCollision as resolveNameCollisionMessage,
    emptyTakenNames,
    resolveDefaultNameAndDirectory,
    TakenNames,
    toTakenNames,
} from "./hooks/resolveAvailableDirectoryName";
import {
    sanitizePackageName,
    validateComponentName,
    validatePackageName,
    validateOrgName,
} from "./utils";

export interface AddComponentFieldsProps {
    formData: AddProjectFormData;
    onFormDataChange: (data: Partial<AddProjectFormData>) => void;
    /**
     * The project the component is added into. Used to list the integrations/libraries
     * already in it, so a colliding name is flagged as it is typed. Empty/nonexistent
     * for the convert flow, where the project does not exist yet.
     */
    projectPath: string;
    /**
     * Whether the caller's own defaults have settled. This mounts with the chooser, so
     * seeding before then would race the arriving suggested defaults over the same
     * `integrationName`.
     */
    defaultsReady?: boolean;
    /**
     * Folder names that will be taken by the time the component is created but are not
     * on disk yet — the convert flow moves the current integration into the new
     * project, so its folder is reserved before it exists there.
     */
    reservedFolders?: string[];
    organizations?: Organization[];
    isOrgLocked?: boolean;
    isOrgDataLoaded?: boolean;
    /** Called when the user edits the org field, so the resolved default stops overwriting it. */
    onOrgTouched?: () => void;
    /**
     * Whether the user has taken manual control of the package name. Owned by the
     * parent so it survives a remount — otherwise an edited package name would be
     * re-coupled to the component name.
     */
    packageNameTouched?: boolean;
    onPackageNameTouched?: () => void;
    /**
     * Whether the user has typed a name. Also parent-owned: the seeded,
     * collision-indexed default must never silently rename a name they chose, and
     * this remounts every time the starting point is revisited.
     */
    nameTouched: boolean;
    onNameTouched: () => void;
    /** Server-side package-name error surfaced by the submit-time path validation. */
    packageNameValidationError?: string;
    /** Reports the live name-collision diagnostic so the parent can block submit. */
    onNameErrorChange: (error: string | null) => void;
}

/**
 * The name and package details of the starting point being added to a project. Which one
 * it is comes from `formData.isLibrary`, which only changes the labels — both routes
 * collect the same fields and are rendered inline on the chooser, which submits them.
 * (The three-step Create Integration wizard is bypassed, as `CreateProjectChooser`
 * bypasses it in the welcome-view Create flow.)
 *
 * The target project is already settled by the caller, so — unlike `LibraryCreationView`
 * in the welcome-view Create flow — there is no location field here; only the component's
 * own identity.
 *
 * Three things are derived from the name, exactly as the integration wizard derived them:
 *  - the on-disk folder (`packageDirectoryName`), kept independent of the Ballerina
 *    package name, which a library can still override under Advanced Configurations;
 *  - a collision-free default, indexed against what the project already contains;
 *  - a live diagnostic when a typed name collides with an existing integration or
 *    library, so it is caught here rather than by the submit-time path check.
 */
export function AddComponentFields({
    formData,
    onFormDataChange,
    projectPath,
    defaultsReady = true,
    reservedFolders,
    organizations,
    isOrgLocked,
    isOrgDataLoaded,
    onOrgTouched,
    packageNameTouched,
    onPackageNameTouched,
    nameTouched,
    onNameTouched,
    packageNameValidationError,
    onNameErrorChange,
}: AddComponentFieldsProps) {
    const isLibrary = !!formData.isLibrary;
    const terms = useProductTerms();
    const componentLabel = isLibrary ? "Library" : terms.integrationLabel;
    const { wsClient } = useBiWsContext();
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [componentNameError, setComponentNameError] = useState<string | null>(null);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [takenNames, setTakenNames] = useState<TakenNames>(emptyTakenNames());
    // The location `takenNames` describes. Keyed on the path rather than a seen-once flag
    // because this renders on the chooser, where the convert flow can still retarget the
    // project while the fields are open.
    const takenNamesPathRef = useRef<string | null>(null);
    // Mirrors the prop so the async seeding below reads the value as of when the
    // listing resolves, not the one captured when the effect started — the user can
    // type during that window.
    const nameTouchedRef = useRef(nameTouched);
    nameTouchedRef.current = nameTouched;

    const debouncedSetComponentNameError = useMemo(
        () => debounce((error: string) => setComponentNameError(error), 300),
        []
    );

    // Reserved-but-not-yet-on-disk folders are merged in as a separate memo so a new
    // `reservedFolders` array identity does not re-trigger the listing effect below.
    const reservedKey = (reservedFolders ?? []).join("\0");
    const effectiveTakenNames = useMemo<TakenNames>(() => {
        if (!reservedKey) {
            return takenNames;
        }
        const folders = new Set(takenNames.folders);
        for (const folder of reservedKey.split("\0")) {
            if (folder) {
                folders.add(folder.toLowerCase());
            }
        }
        return { folders, titles: takenNames.titles };
    }, [takenNames, reservedKey]);

    // List what the project already contains, then index the seeded default name and
    // folder past any collision. Re-lists when the target project moves, which only the
    // integration route can do; the same listing backs the live check below.
    useEffect(() => {
        const target = projectPath.trim();
        if (!defaultsReady || !target || target === takenNamesPathRef.current) {
            return;
        }
        let mounted = true;

        (async () => {
            let taken = emptyTakenNames();
            try {
                taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: target }));
            } catch {
                // Best effort — an unavailable listing only costs the indexed default;
                // the submit-time path check still guards the actual creation. Keeping a
                // previous project's listing would reject names that are free in this one.
            }
            if (!mounted) {
                return;
            }
            takenNamesPathRef.current = target;
            setTakenNames(taken);

            if (nameTouchedRef.current) {
                return;
            }
            const withReserved = { ...taken, folders: new Set(taken.folders) };
            for (const folder of reservedFolders ?? []) {
                withReserved.folders.add(folder.toLowerCase());
            }
            const base = formData.integrationName?.trim() || "Untitled";
            const { name, directoryName } = resolveDefaultNameAndDirectory(base, withReserved, sanitizePackageName);
            onFormDataChange({
                integrationName: name,
                packageDirectoryName: directoryName,
                ...(packageNameTouched ? {} : { packageName: sanitizePackageName(name) }),
            });
        })();

        return () => {
            mounted = false;
        };
    }, [wsClient, projectPath, defaultsReady]);

    const handleComponentName = (value: string) => {
        onNameTouched();
        onFormDataChange({
            integrationName: value,
            // The folder tracks the display name and stays independent of the package
            // name. A name the user types is used verbatim — only the seeded default
            // is auto-indexed — matching the integration wizard.
            packageDirectoryName: sanitizePackageName(value),
            ...(packageNameTouched ? {} : { packageName: sanitizePackageName(value) }),
        });
    };

    // Clear a valid name immediately, but debounce new errors so "required" does not
    // flash on every keystroke while the field is being typed into.
    useEffect(() => {
        const error =
            validateComponentName(formData.integrationName, isLibrary) ||
            resolveNameCollisionMessage(formData.integrationName, effectiveTakenNames, sanitizePackageName);
        onNameErrorChange(error);
        if (!error) {
            debouncedSetComponentNameError.cancel();
            setComponentNameError(null);
            return;
        }
        debouncedSetComponentNameError(error);
        return () => debouncedSetComponentNameError.cancel();
    }, [formData.integrationName, effectiveTakenNames, isLibrary]);

    useEffect(() => {
        setPackageNameError(validatePackageName(formData.packageName, formData.integrationName));
    }, [formData.packageName, formData.integrationName]);

    // Computed inline — a useState/useEffect pair would leave `hasError` reading a
    // stale org error for one render while the resolved default is being applied.
    const orgNameError = (!isOrgLocked && isOrgDataLoaded) ? validateOrgName(formData.orgName) : null;

    const hasAdvancedConfigError = !!(packageNameError || packageNameValidationError || orgNameError);

    // Auto-expand Advanced Configurations when any field inside it has an error.
    useEffect(() => {
        if (hasAdvancedConfigError) {
            setIsPackageInfoExpanded(true);
        }
    }, [hasAdvancedConfigError]);

    return (
        <>
            <FieldGroup>
                <TextField
                    onTextChange={handleComponentName}
                    value={formData.integrationName}
                    label={`${componentLabel} Name`}
                    placeholder={`Enter ${isLibrary ? "a library" : `an ${terms.integrationNoun}`} name`}
                    // Not auto-focused: both routes now render inline on the chooser, where
                    // the convert flow's Project Name already claims focus.
                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                    required={true}
                    errorMsg={componentNameError || ""}
                />
            </FieldGroup>

            <SectionDivider />

            <AdvancedConfigurationSection
                isExpanded={isPackageInfoExpanded}
                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                data={{
                    packageName: formData.packageName,
                    orgName: formData.orgName,
                    version: formData.version,
                }}
                onChange={(data) => {
                    onFormDataChange(data);
                    if (data.packageName !== undefined) {
                        onPackageNameTouched?.();
                    }
                    if (data.orgName !== undefined) {
                        onOrgTouched?.();
                    }
                }}
                isLibrary={isLibrary}
                packageNameError={packageNameValidationError || packageNameError}
                orgNameError={orgNameError || undefined}
                organizations={organizations}
                hasError={hasAdvancedConfigError}
                isOrgLocked={isOrgLocked}
                showPackageFields={true}
            />
        </>
    );
}
