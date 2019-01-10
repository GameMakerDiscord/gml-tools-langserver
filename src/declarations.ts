import { CompletionItemKind, FoldingRange, Location, Position } from 'vscode-languageserver';
import { Resource, EventType, EventNumber } from 'yyp-typings';
import { BasicResourceType } from './Reference/reference';
import { DiagnosticHandler, GMLVarParse } from './diagnostic';

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
        fnames: FnamesParse;
    }

    export interface FnamesParse {
        InstanceVar: string[];
        Constants: string[];
        Obsolete: string[];
        ReadOnly: string[];
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
        doNotAutoComplete: boolean;
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
export interface ICallables {
    scripts: { [key: string]: IScriptEvent };
    events: { [key: string]: IScriptEvent };
    functions: { [key: string]: IFunction };
    extensions: { [key: string]: IExtension };
}

export interface ICallable {
    JSDOC: JSDOC;
    referenceLocations: Location[];
}

export interface IScriptEvent extends ICallable {
    uri: string;
    members: IVars;
}

export interface IFunction extends ICallable {
    doNotAutoComplete: boolean;
}

export interface IExtension extends ICallable {
    doNotAutoComplete: boolean;
    originLocation: Location;
}

export interface IObjects {
    [objectName: string]: IObject;
}

export interface IObject {
    referenceURIs: IURIRecord[];
    members: IVars;
}

export interface IVars {
    [variableName: string]: IVariable;
}

export interface GenericResourceModel {
    origin: GenericOriginInformation;
    referenceLocations: Location[];
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

export interface IURIRecords {
    [thisUri: string]: IURIRecord;
}

export interface IURIRecord {
    localVariables: { [name: string]: GenericResourceModel };
    instanceVariablesRecords: InstVarRecord[];
    events: URIRecord[];
    scripts: URIRecord[];
    functions: URIRecord[];
    extensions: URIRecord[];
    macros: URIRecord[];
    enums: URIRecord[];
    enumMembers: EnumMemberRecord[];
    implicitThisAtPosition: ThisPositionRecord[];
    hash: string;
}

export interface ThisPositionRecord {
    position: Position;
    objName: string;
}

export interface GMLDocOverrides {
    name: string;
    originalEntry?: IScriptEvent;
}

//#region FS

export interface GMLScriptContainer {
    [propName: string]: GMLScript;
}

export interface GMLScript {
    directoryFilepath: string;
    gmlFile: string;
    yyFile: Resource.Script | string;
}

export interface JSDOC {
    signature: string;
    returns: string;
    minParameters: number;
    maxParameters: number;
    parameters: Array<JSDOCParameter>;
    description: string;
    isScript: boolean;
    link?: string;
}

export interface JSDOCParameter {
    label: string;
    documentation: string;
}

export interface GMLObjectContainer {
    [propName: string]: GMLObject;
}

export interface GMLObject {
    directoryFilepath: string;
    events: Array<EventInfo>;
    yyFile: Resource.Object;
}

export interface GMLSpriteContainer {
    [spriteName: string]: GMLSprite;
}

export interface GMLSprite {
    directoryFilepath: string;
    yyFile: Resource.Sprite;
}

export interface EventInfo {
    eventType: EventType;
    eventNumb: EventNumber;
}

export interface DocumentFolders {
    [uri: string]: DocumentFolder;
}

export interface DocumentFolder {
    name: string;
    type: BasicResourceType;
    fileFullText: string;
    diagnosticHandler: DiagnosticHandler | null;
    eventInfo?: EventInfo;
}

export type GMResourcePlus = Resource.GMResource | GMLFolder;

/**
 * This is a copy of the normal Resource.GMFolder interface,
 * except that it allows for children to be other GMLFolders.
 */
export interface GMLFolder {
    /** Resource GUID */
    id: string;

    /** Internal resource type descriptor */
    modelName: 'GMLFolder';

    /** Version string, appears to be 1.0 or 1.1 */
    mvc: string;

    /** Resource name */
    name: string;

    /** An array of the views/resource GUIDs which this folder contains. */
    children: GMResourcePlus[];

    /** The FilterType of the View */
    filterType: string;

    /** The folder name itself */
    folderName: string;

    /** Indicates if the view is the Default Node. */
    isDefaultView: boolean;

    /** A code, likely used for adding localizations. */
    localisedFolderName: Resource.localisedNames;
}

export interface TempFolder {
    tempID: string;
    tempPath: string;
}

export interface CompileProjInfo {
    project_dir: string;
    project_path: string;
    project_name: string;

    temp_id: string;
    temp_path: string;
}

export interface Build {
    assetCompiler: string;
    debug: string;
    compile_output_file_name: string;
    useShaders: string;
    steamOptions: string;
    config: string;
    outputFolder: string;
    projectName: string;
    projectDir: string;
    preferences: string;
    projectPath: string;
    tempFolder: string;
    userDir: string;
    runtimeLocation: string;
    applicationPath: string;
    macros: string;
    targetOptions: string;
    targetMask: string;
    verbose: string;
    helpPort: string;
    debuggerPort: string;
}

export interface CompileOptions {
    yyc: boolean;
    test: boolean;
    debug: boolean;
    verbose: boolean;
    config: string;
    zip: undefined;
    installer: undefined;
}
//#endregion
