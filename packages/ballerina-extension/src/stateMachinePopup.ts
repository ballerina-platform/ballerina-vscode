/* eslint-disable @typescript-eslint/naming-convention */
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

import { createMachine, assign, interpret } from 'xstate';
import * as vscode from 'vscode';
import { EVENT_TYPE, PopupVisualizerLocation, webviewReady, PopupMachineStateValue, onParentPopupSubmitted } from '@wso2/ballerina-core';
import { VisualizerWebview } from './views/visualizer/webview';
import { RPCLayer } from './RPCLayer';
import { StateMachine } from './stateMachine';

interface PopupMachineContext extends PopupVisualizerLocation {
    errorCode: string | null;
}

const stateMachinePopup = createMachine<PopupMachineContext>({
    /** @xstate-layout N4IgpgJg5mDOIC5QFsCWBaADge0wV0wGIAlAUQGVSAVAfXKoEErSBtABgF1FQdZUAXVNgB23EAA9EAFgBMAGhABPRADYAzCoB0ARgCcugBzaA7GpkqpxgL5WFaLLgKbUwgagCGAG1QAvMIQgRMGdhADdsAGtg+xx8TBC3L18wBBdwgGN3QRF2DlyxXjcRMUkEXW0ZTTUDGuMpKTZtNgBWNgMFZQQ6yt0VY10ZbWbe7QqpGzsMWKcXRO8-QjAAJyXsJc1MTyyAMzXkTRjHeNnBJL9UsOxM7OFc-KQQQpuSxGHK5uNzDRkatkspDqqCqaYzaBpsT4yKRqXRqNQTECHOKaJZgdwQRSEADyAAVSAA5GgANQAkqQAOr3HjYPjPB6lGqVEzaAy6Op9QYwwEIMwGTQqFTNKQqNpsvRDBFIpy4MDCTTudKCUL+XEE4lkymcAo0oqienSZqVWSwhoC4x9YzGbk-LSg5raMy8gxqD6SqZHTQyuUKpX+ADCABksZR1RSqY8dXTQKV6nzmgZmvG7cY2GYVNypM0tAYLGw2oM-np4bZEe7kV6UWAvQEgiFwlEDmXpZhZZWvRcMlkhLdOOGnt2XghhdpNLo2q1LY1LcLuQ7dJoZHC4bpM-aZIni5MHOWW3LhNhBNtMYFhME0pFok34hX94fFB2rl2cr2tQ9+8V9QgDND+SzBuuZEMDR0yUVRhhBdRWRkNhzEGS0bBLfcIDgMQpUwbVaQHT90BAzp0A0HRtAFYZJz0b9rBLNCElOeYwAw3VBx+NRND+c0ZFBMxp25Oo+UzXQsykB0pH4nM3W3JxUXRTpqUwj9o0QJp7X5FQDGMAw-kE8V2lAhBWkqOoXRXFdoJdFQxOma9d3oqMJEQH5jE0TNoTUOoU2FWRuSUxNnWqWQHUtFQZHMj0Kx9VBlWsrD5J5F1HKFOFXL+Cx5B0tQ81HQCUzUCoYNMddgp3VtUS9SK5NshBBS0H56lhQVUykHNrQFTR7VGBNDX6FQHWaArm1bW9UCPUq9WiwUpBYwL1EXLMjBSzpVwm8Ei1U1Txkoq9NAgVBYHcAAjTxIGGwcPJ05o0pa4T1KGVTWlUhCrCAA */
    id: 'popup-machine',
    initial: 'initialize',
    predictableActionArguments: true,
    context: {
        errorCode: null,
        view: null
    },
    states: {
        initialize: {
            invoke: {
                src: 'initializeData',
                onDone: {
                    target: 'ready',
                    actions: assign({
                        documentUri: (context, event) => event.data.documentUri,
                    })
                },
                onError: {
                    target: 'disabled',
                    actions: assign({
                        errorCode: (context, event) => event.data,
                    })
                }
            }
        },
        ready: {
            on: {
                OPEN_VIEW: {
                    target: "open",
                    actions: assign({
                        view: (context, event) => event.viewLocation.view,
                        recentIdentifier: (context, event) => "",
                        artifactType: (context, event) => event.viewLocation.artifactType,
                        identifier: (context, event) => event.viewLocation.identifier,
                        documentUri: (context, event) => event.viewLocation.documentUri,
                        metadata: (context, event) => event.viewLocation.metadata,
                        agentMetadata: (context, event) => event.viewLocation?.agentMetadata,
                        dataMapperMetadata: (context, event) => event.viewLocation?.dataMapperMetadata
                    })
                },
            }
        },
        open: {
            initial: "active",
            states: {
                active: {
                    on: {
                        OPEN_VIEW: {
                            target: "reopen",
                            actions: assign({
                                view: (context, event) => event.viewLocation.view,
                                recentIdentifier: (context, event) => "",
                                artifactType: (context, event) => event.viewLocation.artifactType,
                                identifier: (context, event) => event.viewLocation.identifier,
                                documentUri: (context, event) => event.viewLocation.documentUri,
                                metadata: (context, event) => event.viewLocation.metadata,
                                agentMetadata: (context, event) => event.viewLocation?.agentMetadata,
                                dataMapperMetadata: (context, event) => event.viewLocation?.dataMapperMetadata
                            })
                        },
                        VIEW_UPDATE: {
                            actions: assign({
                                view: (context, event) => event.viewLocation.view,
                                recentIdentifier: (context, event) => "",
                                artifactType: (context, event) => event.viewLocation.artifactType,
                                identifier: (context, event) => event.viewLocation.identifier,
                                documentUri: (context, event) => event.viewLocation.documentUri,
                                metadata: (context, event) => event.viewLocation.metadata,
                                agentMetadata: (context, event) => event.viewLocation?.agentMetadata,
                                dataMapperMetadata: (context, event) => event.viewLocation?.dataMapperMetadata
                            })
                        },
                        CLOSE_VIEW: {
                            target: "notify",
                            actions: assign({
                                view: (context, event) => null,
                                recentIdentifier: (context, event) => event.viewLocation.recentIdentifier,
                                artifactType: (context, event) => event.viewLocation.artifactType,
                            })
                        },
                    }
                },
                reopen: {
                    invoke: {
                        src: 'initializeData',
                        onDone: {
                            target: 'active',
                            actions: assign({
                                documentUri: (context, event) => event.data.documentUri,
                            })
                        }
                    }
                },
                notify: {
                    invoke: {
                        src: 'notifyChange',
                        onDone: {
                            target: '#popup-machine.ready'
                        }
                    }
                },
            },
        },
        disabled: {
            invoke: {
                src: 'disableExtension'
            },
        },
    },
    on: {
        RESET_STATE: { // Global event to reset the state to "formReady"
            target: "initialize"
        }
    }
}, {
    services: {
        initializeData: (context, event) => {
            // Get context values from the project storage so that we can restore the earlier state when user reopens vscode
            return new Promise((resolve, reject) => {
                const documentUri = StateMachine.context().projectPath;
                resolve({ documentUri });
            });
        },
        notifyChange: (context, event) => {
            return new Promise((resolve, reject) => {
                RPCLayer._messenger.sendNotification(
                    onParentPopupSubmitted,
                    {
                        type: 'webview',
                        webviewType: VisualizerWebview.viewType
                    },
                    {
                        recentIdentifier: context.recentIdentifier,
                        artifactType: context.artifactType,
                        dataMapperMetadata: context.dataMapperMetadata
                    }
                );
                resolve(true);
            });
        },
        disableExtension: (context, event) => {
            return async (resolve, reject) => {
                vscode.commands.executeCommand('setContext', 'MI.status', 'disabled');
                // TODO: Display the error message to the user
                // User should be able to see the error message and retry
            };
        }
    }
});


// Create a service to interpret the machine
const popupStateService = interpret(stateMachinePopup);

// Define your API as functions
export const StateMachinePopup = {
    initialize: () => popupStateService.start(),
    service: () => { return popupStateService; },
    context: () => { return popupStateService.getSnapshot().context; },
    state: () => { return popupStateService.getSnapshot().value as PopupMachineStateValue; },
    sendEvent: (eventType: EVENT_TYPE, location: PopupVisualizerLocation) => { popupStateService.send({ type: eventType, viewLocation: location }); },
    resetState: () => { popupStateService.send({ type: "RESET_STATE" }); },
    isActive: () => {
        const state = StateMachinePopup.state();
        return typeof state === 'object' && 'open' in state && state.open === 'active';
    }
};

export function openPopupView(type: EVENT_TYPE, viewLocation?: PopupVisualizerLocation) {
    if (type === EVENT_TYPE.OPEN_VIEW) {
        VisualizerWebview.currentPanel?.getWebview()?.reveal();
    }
    popupStateService.send({ type: type, viewLocation: viewLocation });
}
