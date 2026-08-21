import styled from "@emotion/styled";
import React from "react";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Codicon } from "@wso2/ui-toolkit";


export const AuthPanel = styled.div`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    max-width: 420px;
    gap: 12px;
`;

export const AuthTitle = styled.div`
    color: var(--vscode-foreground);
    font-size: 20px;
    font-weight: 400;
`;

export const AuthSubTitle = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.55;
    margin: 0 0 12px;
`;

export const AuthActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
`;

const WideVSCodeButton = styled(VSCodeButton as React.ComponentType)`
    width: 100%;
    max-width: 300px;
    align-self: center;
`;

interface Props {
    title?: string;
    subTitle?: string;
    buttonTitle: string;
    iconName?: string;
    variant?: 'primary' | 'secondary';
    onClick?: () => void;
    buttonDisabled?: boolean;
    buttonId?: string;
}

export const AlertBox = (props: Props) => {
    const { title, buttonTitle, subTitle, iconName, variant = 'primary', buttonDisabled = false, onClick, buttonId } = props;
    return (
        <AuthPanel>
            {title && <AuthTitle>{title}</AuthTitle>}
            {subTitle && <AuthSubTitle>{subTitle}</AuthSubTitle>}
            <AuthActions>
                <VSCodeButton onClick={onClick} appearance={variant} id={`alert-btn${buttonId ? `-${buttonId}` : ''}`}>
                    {iconName && (
                        <>
                            <Codicon name={iconName} /> &nbsp;{" "}
                        </>
                    )}
                    {buttonTitle}
                </VSCodeButton>
            </AuthActions>
        </AuthPanel>
    );
};
