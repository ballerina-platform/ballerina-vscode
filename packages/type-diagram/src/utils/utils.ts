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

import createEngine, { DiagramEngine, NodeModel } from '@projectstorm/react-diagrams';
import {
    CMDependency,
    CMEntryPoint, CMInteraction, CMRemoteFunction, CMResourceFunction,
    CMService,
    ComponentModel,
    ComponentModelDeprecated,
    Member,
    TypeFunctionModel
} from '@wso2/ballerina-core';
import { EntityFactory, EntityLinkFactory, EntityPortFactory } from '../components/entity-relationship';
import { OverlayLayerFactory } from '../components/OverlayLoader';
import { validate as validateUUID } from 'uuid';
import { VerticalScrollCanvasAction } from '../actions/VerticalScrollCanvasAction';
export const CELL_DIAGRAM_MIN_WIDTH = 400;
export const CELL_DIAGRAM_MAX_WIDTH = 800;
export const CELL_DIAGRAM_MIN_HEIGHT = 250;
export const CELL_DIAGRAM_MAX_HEIGHT = 600;

export function createRenderPackageObject(projectPackages: IterableIterator<string>): Map<string, boolean> {
    let packages2render: Map<string, boolean> = new Map<string, boolean>();
    let packages: string[] = Array.from(projectPackages).sort();

    packages.forEach((balPackage) => {
        packages2render.set(balPackage, true);
    })

    return packages2render;
}

export function createEntitiesEngine(): DiagramEngine {
    const diagramEngine: DiagramEngine = createEngine({
        registerDefaultPanAndZoomCanvasAction: false,
        registerDefaultZoomCanvasAction: false,
        registerDefaultDeleteItemsAction: false,
    });
    diagramEngine.getLinkFactories().registerFactory(new EntityLinkFactory());
    diagramEngine.getPortFactories().registerFactory(new EntityPortFactory());
    diagramEngine.getNodeFactories().registerFactory(new EntityFactory());
    diagramEngine.getLayerFactories().registerFactory(new OverlayLayerFactory());
    diagramEngine.getActionEventBus().registerAction(new VerticalScrollCanvasAction());
    return diagramEngine;
}

export function getAngleFromRadians(value: number): number {
    return value * 180 / Math.PI;
}

export function getRadiansFormAngle(value: number): number {
    return value * Math.PI / 180;
}

export function isVersionBelow(projectComponents: Map<string, ComponentModel | ComponentModelDeprecated>, targetVersion: number): boolean {
    const firstComponent = projectComponents.values().next().value;
    if (firstComponent?.modelVersion) {
        return parseFloat(firstComponent.modelVersion) < targetVersion;
    }
    return parseFloat(firstComponent.version) < targetVersion;
}

export function transformToV4Models(projectComponents: Map<string, ComponentModelDeprecated>): Map<string, ComponentModel> {
    const newProjectComponents = new Map<string, ComponentModel>();
    projectComponents.forEach((componentModel: ComponentModelDeprecated, key: string) => {
        const newComponentModel: ComponentModel = {
            id: componentModel.packageId.name,
            orgName: componentModel.packageId.org,
            version: componentModel.packageId.version,
            modelVersion: componentModel.version,
            services: transformToV4Services(componentModel.services, componentModel.packageId.name) as any,
            entities: componentModel.entities,
            diagnostics: componentModel.diagnostics,
            functionEntryPoint: componentModel.functionEntryPoint
                && transformToV4FunctionEntryPoint(componentModel.functionEntryPoint),
            hasCompilationErrors: componentModel.hasCompilationErrors,
            hasModelErrors: false,
            connections: deriveDependencies(componentModel),
        }

        newProjectComponents.set(key, newComponentModel);
    });

    return newProjectComponents;
}

function deriveDependencies(componentModel: ComponentModelDeprecated): CMDependency[] {
    const dependencies: CMDependency[] = [];
    Object.entries(componentModel.services).forEach(([_, service]: [string, any]) => {
        service?.dependencies.forEach((dependency: any) => {
            dependencies.push(transformToV4Dependency(dependency));
        });
    });
    componentModel.functionEntryPoint?.dependencies.forEach((dependency: any) => {
        dependencies.push(transformToV4Dependency(dependency));
    });

    return dependencies;
}

export function transformToV4Services(services: Map<string, any>, packageName: string): Record<string, CMService> {
    const newServices: Record<string, CMService> = {};
    let unnamedSvcIndex = 0;
    Object.entries(services).forEach(([key, service]: [string, any]) => {
        let label = service.annotation.label || service?.path;
        if (!service.path && (!service.annotation.label || validateUUID(service.annotation.label))
            && validateUUID(service.annotation.id)) {
            [label, unnamedSvcIndex] = getLabelAndNextIndex(packageName, unnamedSvcIndex);
        }
        newServices[key] = {
            id: service.serviceId,
            label: label,
            remoteFunctions: transformToV4RemoteFunctions(service.remoteFunctions),
            resourceFunctions: transformToV4ResourceFunctions(service.resources),
            type: service.serviceType,
            dependencies: service?.dependencies?.map((dep: any) => dep?.serviceId),
            annotation: service.annotation,
            deploymentMetadata: service.deploymentMetadata,
            isNoData: service.isNoData,
            sourceLocation: service.elementLocation,
            diagnostics: service.diagnostics
        };
    });

    return newServices;
}

export function transformToV4FunctionEntryPoint(functionEntryPoint: any): CMEntryPoint {
    return {
        id: functionEntryPoint?.annotation?.id,
        label: functionEntryPoint?.annotation?.label,
        interactions: functionEntryPoint.interactions,
        parameters: functionEntryPoint.parameters,
        returns: functionEntryPoint.returns,
        annotation: functionEntryPoint.annotation,
        type: functionEntryPoint.type,
        dependencies: (functionEntryPoint as any)?.dependencies?.map((dep: any) => dep?.serviceId),
        sourceLocation: functionEntryPoint.elementLocation,
        diagnostics: functionEntryPoint.diagnostics
    };
}

export function transformToV4ResourceFunctions(resources: any[]): CMResourceFunction[] {
    return resources.map(resource => {
        return {
            id: `${resource.resourceId.serviceId}:${resource.resourceId.path}:${resource.resourceId.action}`,
            label: resource.resourceId.path,
            interactions: transformToV4Interactions(resource.interactions),
            parameters: resource.parameters,
            returns: resource.returns,
            path: resource.resourceId.path,
            sourceLocation: resource.elementLocation,
            diagnostics: resource.diagnostics
        }
    });
}

export function transformToV4RemoteFunctions(remotes: any[]): CMRemoteFunction[] {
    return remotes.map(remoteFn => {
        return {
            id: remoteFn.name,
            label: remoteFn.name,
            interactions: transformToV4Interactions(remoteFn.interactions),
            parameters: remoteFn.parameters,
            returns: remoteFn.returns,
            name: remoteFn.name,
            sourceLocation: remoteFn.elementLocation,
            diagnostics: remoteFn.diagnostics
        }
    });
}

export function transformToV4Interactions(interactions: any[]): CMInteraction[] {
    return interactions.map(interaction => {
        return {
            id: `${interaction.resourceId.serviceId}:${interaction.resourceId.path}:${interaction.resourceId.action}`,
            type: interaction.connectorType,
            serviceId: interaction.resourceId.serviceId,
            serviceLabel: interaction.serviceLabel,
            sourceLocation: interaction.elementLocation,
            diagnostics: interaction.diagnostics
        }
    });
}

export function transformToV4Dependency(dependency: any): CMDependency {
    return {
        id: dependency.serviceId,
        type: dependency.connectorType,
        serviceLabel: dependency.serviceLabel,
        sourceLocation: dependency.elementLocation,
        diagnostics: dependency.diagnostics
    };
}

function getLabelAndNextIndex(packageName: string, index: number): [string, number] {
    const label: string = `${packageName} Component${index > 0 ? index : ''}`;
    return [label, index + 1];
}

export function focusToNode(node: NodeModel, currentZoomLevel: number, diagramEngine: DiagramEngine) {
    const canvasBounds = diagramEngine?.getCanvas()?.getBoundingClientRect();
    const nodeBounds = node?.getBoundingBox();

    if (canvasBounds && nodeBounds) {
        const zoomOffset = currentZoomLevel / 100;
        const offsetX = canvasBounds.width / 2 - (nodeBounds.getTopLeft().x + nodeBounds.getWidth() / 2) * zoomOffset;
        const offsetY = canvasBounds.height / 2 - (nodeBounds.getTopLeft().y + nodeBounds.getHeight() / 2) * zoomOffset;

        diagramEngine.getModel().setOffset(offsetX, offsetY);
        diagramEngine.repaintCanvas();
    }
}

export const getAttributeType = (attr: Member | TypeFunctionModel): string => {

    const type = 'returnType' in attr ? attr.returnType : (attr as Member).type;
    const isOptional = 'optional' in attr && attr.optional;

    if (typeof type === 'string') {
        return isOptional ? `${type}|()` : type;
    }

    const formatUnionType = (types: string[]): string => types.join('|');

    // Get base type representation based on node kind
    const getTypeString = (members: Member[]): string => {
        const memberTypes = members.map(member => {
            if (typeof member.type === 'string') {
                return member.optional ? `${member.type}|()` : member.type;
            }
            return getAttributeType(member);
        });

        let baseType: string;
        switch (type.codedata.node) {
            case 'ARRAY':
                const elementType = memberTypes[0];
                const elementMember = members[0];
                // Check if the immediate child is a union type
                const isUnionType = typeof elementMember.type === 'object' && elementMember.type.codedata.node === 'UNION';
                baseType = isUnionType ? `(${elementType})[]` : `${elementType}[]`;
                break;
            case 'UNION':
                baseType = formatUnionType(memberTypes);
                break;
            case 'MAP':
                baseType = `map<${memberTypes[0]}>`;
                break;
            case 'TABLE':
                const rowType = members.find(m => m.name === 'rowType');
                const keyConstraint = members.find(m => m.name === 'keyConstraintType');
                const tableType = rowType ? getAttributeType(rowType) : 'unknown';
                baseType = keyConstraint
                    ? `table<${tableType}> key<${getAttributeType(keyConstraint)}>`
                    : `table<${tableType}>`;
                break;
            case 'STREAM':
                baseType = `stream<${[...memberTypes].reverse().join(',')}>`;
                break;
            case 'FUTURE':
                baseType = `future<${memberTypes[0] || ''}>`;
                break;
            case 'TYPEDESC':
                baseType = `typedesc<${memberTypes[0] || ''}>`;
                break;
            case 'TUPLE':
                // The language server lists tuple members in declaration order.
                baseType = `[${memberTypes.join(',')}]`;
                break;
            case 'RECORD':
                const recordMembers = [...members].reverse().map(member => {
                    const memberType = typeof member.type === 'string' ? member.type : getAttributeType(member);
                    return `${memberType} ${member.name}`;
                });
                baseType = `record {${recordMembers.join(', ')}}`;// TODO: Verify anonymous records representation
                break;
            case 'ERROR':
                baseType = `error`; // HACK: This is a hack to represent error till we get refs a empty
                break;
            default:
                baseType = type.name || 'unknown';
        }

        return isOptional ? `${baseType}|()` : baseType;
    };

    return getTypeString(type.members);
};
