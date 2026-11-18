/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { TextField, Button, Codicon, Divider, Typography, ThemeColors } from "@wso2/ui-toolkit";
import { FIELD_RADIUS } from "../../MultiModeExpressionEditor/ChipExpressionEditor/constants";

const PopupContainer = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 30000;
    display: flex;
    justify-content: center;
    align-items: center;
`;

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.4);
    z-index: 29999;
`;

const PopupBox = styled.div`
    width: 400px;
    max-width: 90vw;
    max-height: 90vh;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px;
    border-radius: ${FIELD_RADIUS};
    background-color: ${ThemeColors.SURFACE_DIM};
    box-shadow: 0 3px 8px rgb(0 0 0 / 0.2);
    z-index: 30001;
`;

const PopupHeader = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-inline: 16px;
    margin-bottom: 8px;
`;

const PopupContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
`;

const DialogActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
    padding: 0 16px 8px;
`;

interface LinkDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (href: string, title?: string) => void;
    initialTitle?: string;
}

export const LinkDialog: React.FC<LinkDialogProps> = ({
    isOpen,
    onClose,
    onInsert,
    initialTitle = ""
}) => {
    const [url, setUrl] = useState("");
    const [title, setTitle] = useState(initialTitle);

    useEffect(() => {
        if (isOpen) {
            setUrl("");
            setTitle(initialTitle);
        }
    }, [isOpen, initialTitle]);

    const handleInsert = () => {
        if (!url.trim()) return;
        onInsert(url.trim(), title.trim() || undefined);
        handleClose();
    };

    const handleClose = () => {
        setUrl("");
        setTitle("");
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && url.trim()) {
            e.preventDefault();
            handleInsert();
        } else if (e.key === "Escape") {
            e.preventDefault();
            handleClose();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <Overlay onClick={handleClose} />
            <PopupContainer>
                <PopupBox onKeyDown={handleKeyDown}>
                    <PopupHeader>
                        <Typography variant="h3" sx={{ margin: 0 }}>
                            Create a link
                        </Typography>
                        <Codicon name="close" onClick={handleClose} />
                    </PopupHeader>
                    <Divider />
                    <PopupContent>
                        <TextField
                            label="Link target"
                            placeholder="https://example.com"
                            value={url}
                            onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
                            autoFocus={true}
                            required={true}
                        />

                        <TextField
                            label="Title"
                            placeholder="Link text (optional)"
                            value={title}
                            onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
                        />
                    </PopupContent>
                    <DialogActions>
                        <Button appearance="secondary" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button
                            appearance="primary"
                            onClick={handleInsert}
                            disabled={!url.trim()}
                        >
                            Insert Link
                        </Button>
                    </DialogActions>
                </PopupBox>
            </PopupContainer>
        </>
    );
};
