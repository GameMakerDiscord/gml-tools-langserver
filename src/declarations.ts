import { CompletionItemKind, FoldingRange, Location, Position } from 'vscode-languageserver';
import { JSDOC } from './fileSystem';
import URI from 'vscode-uri';

export const enum SpecialDocTypes {
    Constant = '#',
    Readonly = '*',
    InstVar = '@',
    Obsolete = '&',
    Script = '!'
}

export interface Token {
    tokenName: string;
    startIdx: number;
    length: number;
}

export const enum SignatureWalkState {
    FINAL_OPEN = 0,
    FINAL_FUNC = 1,
    INTERMEDIARY_OPEN = 2
}

export const enum TokenNames {
    comma = 'comma',
    oParens = 'oParens',
    cParens = 'cParens',
    funcIdentifier = 'funcIdentifier'
}

export const enum LanguageService {
    GMLDefinitionProvider = 0,
    GMLSignatureProvider = 1,
    GMLCompletionProvider = 2,
    GMLHoverProvider = 3,
    FileSystem = 4,
    Reference = 5
}

export const enum SemanticsOption {
    Function = 1,
    Variable = 2,
    JavaDoc = 4,
    All = Function | Variable | JavaDoc
}

export interface IGMLDocumentation {
    [key: string]: IGMLDoc;
}

export interface IGMLDoc {
    parameters: Array<IParameter>;
    example: IExample;
    signature: string;
    documentation: string;
    return: string;
}

export interface IParameter {
    label: string;
    documentation: string;
    type: null;
}

export interface IExample {
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

export type OtherResources = [string[], CompletionItemKind];

/**
 * Namespace describing all GMLDocs interfaces.
 */
export namespace GMLDocs {
    /**
     * This describes the saved DocFile we create.
     */
    export interface DocFile {
        functions: DocFunction[];
        variables: DocVariable[];
    }

    /**
     * Scrapped Documentation Function information.
     */
    export interface DocFunction {
        name: string;
        signature: string;
        parameters: DocParams[];
        minParameters: number;
        maxParameters: number;
        example: DocExample;
        documentation: string;
        return: string;
        link: string;
        doNotAutoComplete?: boolean;
    }
    /**
     * Scrapped Documentation Variable information.
     */
    export interface DocVariable {
        name: string;
        example: DocExample;
        documentation: string;
        type: string;
        link: string;
        object: string;
        doNotAutoComplete?: boolean;
    }

    /**
     * Scrapped Documentation Parameter information.
     */
    export interface DocParams {
        label: string;
        documentation: string;
    }
    /**
     * Scrapped Documentation Example information.
     */
    export interface DocExample {
        code: string;
        description: string;
    }

    /**
     * Enum used very briefly in the `documentationImporter` to
     * differentiate functions and variables by the presence of
     * "()" in their "signature" property.
     */
    export const enum DocType {
        function = 0,
        variable = 1
    }
}

export namespace GMLToolsSettings {
    export interface Config {
        preferredSpellings: SpellingSettings;
        numberOfDocumentationSentences: number;
        [someString: string]: any;
    }

    export const enum SpellingSettings {
        american = 'American',
        british = 'British',
        noPref = 'No Preference'
    }
}
export declare type ResourceNames =
    | 'objects'
    | 'rooms'
    | 'sprites'
    | 'sounds'
    | 'paths'
    | 'views'
    | 'scripts'
    | 'fonts'
    | 'timelines'
    | 'tilesets'
    | 'notes'
    | 'extensions'
    | 'shaders'
    | 'datafiles_yy';

// Reference

export interface IScriptsAndFunctions {
    [key: string]: IEachScript;
}

export interface IEachScript {
    JSDOC: JSDOC;
    uri?: URI;
    callBackLocation?: number;
    isBritish?: boolean;
    referenceLocations: Array<Location>;
}

export interface IObjects {
    [objectName: string]: IVars;
}

export interface IVars {
    [variableName: string]: IVariable;
}

export interface GenericResourceModel {
    origin: GenericOriginInformation;
    referenceLocations: Array<Location>;
}

export interface GenericOriginInformation {
    /**
     * The index of origin refers to the index in the
     * `referenceLocations` array in a GenericResourceModel.
     */
    indexOfOrigin: number | null;
}

export interface IVariable extends GenericResourceModel {
    origin: IOriginVar;
}

export interface IOriginVar extends GenericOriginInformation {
    indexOfOrigin: number;
    varRank: VariableRank;
    isSelf: boolean;
}

export interface IMacro extends GenericResourceModel {
    origin: IMacroOrigin;
}

export interface IMacroOrigin extends GenericOriginInformation {
    value: string;
}

export interface IEnum extends GenericResourceModel {
    origin: IEnumOrigin;
}

export interface IEnumOrigin extends GenericOriginInformation {
    enumMembers: { [name: string]: IEnumMembers };
}

export interface IEnumMembers extends GenericResourceModel {
    value: string;
}

export enum VariableRank {
    Create,
    BegStep,
    Step,
    EndStep,
    Other,
    Num
}

export interface URIRecord {
    index: number;
    name: string;
}

export interface InstVarRecord extends URIRecord {
    object: string;
    isOrigin: boolean;
}

export interface EnumMemberRecord extends URIRecord {
    /** This is the name of the Enum like ENUM in "ENUM.member" */
    enumName: string;

    /** This is the name of the enum member like MEMBER in "enum.MEMBER" */
    name: string;
}

export interface IURIRecord {
    localVariables: { [name: string]: GenericResourceModel };
    instanceVariables: InstVarRecord[];
    scriptsAndFunctions: URIRecord[];
    foldingRanges: FoldingRange[];
    macros: URIRecord[];
    enums: URIRecord[];
    enumMembers: EnumMemberRecord[];
    implicitThisAtPosition: ThisPositionRecord[];
}

export interface ThisPositionRecord {
    position: Position;
    objName: string;
}

export interface GMLDocOverrides {
    name: string;
    originalEntry?: IEachScript;
}
