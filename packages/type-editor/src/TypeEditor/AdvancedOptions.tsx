import React, { useState } from 'react';
import { Button, CheckBox, Codicon } from '@wso2/ui-toolkit';
import { Type } from '@wso2/ballerina-core';
import { AssistMark, SectionChanges } from '@wso2/ballerina-side-panel';

interface AdvancedOptionsProps {
    type: Type;
    onChange: (type: Type) => void;
}

enum TypeNodeKind {
    RECORD = "RECORD",
    ENUM = "ENUM",
    CLASS = "CLASS",
    UNION = "UNION",
    ARRAY = "ARRAY"
}

export function AdvancedOptions({ type, onChange }: AdvancedOptionsProps) {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);

    return (
        <div>
            <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '15px', marginBottom: '5px', cursor: 'pointer' }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Button
                    appearance='icon'
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                    }}
                >
                    <Codicon name={isExpanded ? "chevron-up" : "chevron-down"} />
                </Button>
                <span>Advanced Options</span>
                <SectionChanges keys={["isReadOnly", "isPublic"]} onReveal={() => setIsExpanded(true)} />
            </div>
            {isExpanded && (
                <>
                    {type.codedata.node === TypeNodeKind.RECORD && <CheckBox
                        sx={{ border: 'none', padding: '5px' }}
                        label="Allow Additional Fields"
                        checked={type?.allowAdditionalFields === true}
                        onChange={(checked: boolean) => {
                            onChange({ ...type, allowAdditionalFields: checked });
                        }}
                    />}
                    <div>
                        <CheckBox
                            sx={{ border: 'none', padding: '5px' }}
                            label="Readonly Type"
                            checked={type?.properties?.isReadOnly?.value === "true"}
                            onChange={(checked: boolean) => {
                                // Match the same pattern used in the working checkbox
                                onChange({
                                    ...type,
                                    properties: {
                                        ...type.properties,
                                        isReadOnly: {
                                            ...type.properties?.isReadOnly,
                                            value: checked ? "true" : "false"
                                        }
                                    }
                                });
                            }}
                        />
                        <AssistMark fieldKey="isReadOnly" />
                    </div>
                    <div>
                        <CheckBox
                            sx={{ border: 'none', padding: '5px' }}
                            label="Accessible by Other Integrations"
                            checked={type?.properties?.isPublic?.value === "true"}
                            onChange={(checked: boolean) => {
                                // Match the same pattern used in the working checkbox
                                onChange({
                                    ...type,
                                    properties: {
                                        ...type.properties,
                                        isPublic: {
                                            ...type.properties?.isPublic,
                                            value: checked ? "true" : "false"
                                        }
                                    }
                                });
                            }}
                        />
                        <AssistMark fieldKey="isPublic" />
                    </div>
                </>
            )}
        </div>
    );
}
