import { MacroPackage } from "./diagnostic";
import { CompletionItemKind } from "vscode-languageserver";

export declare const enum ResourceType {
    Object = 0,
    Script = 1,
    Sprite = 2
}

export interface Token {
    tokenName: string,
    startIdx: number,
    length: number
}

export declare const enum SignatureWalkState {
    FINAL_OPEN = 0,
    FINAL_FUNC = 1,
    INTERMEDIARY_OPEN = 2
}

export declare const enum TokenNames {
    comma = "comma",
    oParens = "oParens",
    cParens = "cParens",
    funcIdentifier = "funcIdentifier"
}

export declare const enum LanguageService {
    GMLDefinitionProvider = 0,
    GMLSignatureProvider = 1,
    GMLCompletionProvider = 2,
    GMLHoverProvider = 3,
    FileSystem = 4,
    Reference = 5
}

export declare const enum SemanticsOption {
    Function = 1,
    Variable = 2,
    EnumsAndMacros = 4,
    JavaDoc = 8,
    All = Function|Variable|EnumsAndMacros|JavaDoc
}

export interface IGMLDocumentation {
    [key: string]: IGMLDoc
}

export interface IGMLDoc {
    parameters: Array<IParameter>;
    example: IExample;
    signature: string;
    documentation: string;
    return: string;
}

interface IParameter {
    label: string;
    documentation: string;
    type: null;
}

interface IExample {
    code: string;
    description: string;
}

export interface CreateObjPackage {
    objectName: string;
    objectEvents: string | string[];
    sprite: string;
}

export interface AddEventsPackage {
    uri: string;
    events: string[];
}

export declare type enumsMacros = [string[], MacroPackage[]];

export declare type OtherResources = [string[], CompletionItemKind];