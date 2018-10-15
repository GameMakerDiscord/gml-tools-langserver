import { Interval, Node, Grammar, MatchResult, ActionDict, Semantics } from 'ohm-js';
import { Diagnostic, Range, DiagnosticSeverity, Position } from 'vscode-languageserver/lib/main';
import {
    lastIndexOfArray,
    normalizeEoLSequences,
    regexIndexOf,
    getIndexFromPosition,
    getPositionFromIndex,
    regexLastIndexOf
} from './utils';
import { Reference } from './reference';
import { JSDOC, JSDOCParameter, DocumentFolder } from './fileSystem';
import { Token, VariableRank } from './declarations';
import { EventType, EventNumber } from 'yyp-typings';

export enum EIterArray {
    InitExpression,
    Comma,
    SubsequentExpressions
}

/**
 * indexRange is the absolute equivalent to Range, which takes
 * "Position", where this takes absolute Index.
 */
export interface IndexRange {
    startIndex: number;
    endIndex?: number;
}

export abstract class DiagnosticsPackage {
    static create(uri: string, diagnostics: Diagnostic[]) {
        return { uri, diagnostics };
    }
}

export abstract class DiagnosticCreator {
    static create(severity: DiagnosticSeverity, message: string, source: string, range: Range) {
        return { severity, message, source, range };
    }
}

export interface GMLFunctionStack {
    readonly name: string;
    readonly interval: Interval;
    readonly isScript: boolean;
    readonly exists?: boolean;
    readonly minParams?: number;
    readonly maxParams?: number;
}

export interface MatchResultsPackage {
    indexRange: IndexRange;
    matchResult: MatchResult;
}

export interface ohmLineAndColum {
    lineNum: number;
    colNum: number;
    line: string;
    prevLine: string;
    nextLine: string;
}

export interface VariablesPackage {
    variables: Array<GMLVarParse>;
    localVariables: Array<GMLLocalVarParse>;
}

export interface IActionDict {
    actionDict: ActionDict;
    name: string;
}

export interface GMLVarParse {
    object: string;
    supremacy: VariableRank;
    isSelf: boolean;
    name: string;
    range: Range;
}

export interface GMLLocalVarParse {
    name: string;
    range: Range;
    isOrigin: boolean;
}

export interface SignaturePackage {
    name: string;
    indexRange: IndexRange;
    parameters: SignaturePackage[];
    functionParameters: SignaturePackage[];
    parent?: SignaturePackage;
}

export interface MacroPackage {
    macroName: string;
    macroValue: string;
}

export class LintPackage {
    private diagnostics: Diagnostic[];
    private matchResults: MatchResultsPackage[];

    constructor() {
        this.diagnostics = [];
        this.matchResults = [];
    }

    public set(diag: Diagnostic[], matchRess: MatchResultsPackage[]) {
        this.diagnostics = diag;
        this.matchResults = matchRess;
    }

    public setMatchResultsPackage(matchRess: MatchResultsPackage[]) {
        this.matchResults = matchRess;
    }

    public setDiagnostics(diag: Diagnostic[]) {
        this.diagnostics = diag;
    }

    public getDiagnostics() {
        return this.diagnostics;
    }

    public getMatchResults() {
        return this.matchResults;
    }
}

export class DiagnosticHandler {
    // Declarations:
    private uri: string;
    private localQuickCheck: Array<string>;
    private functionStack: Array<GMLFunctionStack>;
    private semanticDiagnostics: Diagnostic[];
    private matcher: any;
    private matchResult: any;
    private semantics: Semantics;
    private semanticIndex: number;
    private currentFullTextDocument: string;
    private reference: Reference;
    private jsdocGenerated: JSDOC;
    private tokenList: Token[];
    private currentObjectName: string;
    private currentObjectRange: Range;
    private currentRank: VariableRank;
    private isSelf: boolean;
    private currentEnumeration: number;
    private currentEnumName: string | null;

    // Constructor:
    constructor(grammar: Grammar, uri: string, reference: Reference) {
        this.functionStack = [];
        this.currentEnumeration = 0;
        this.currentEnumName = null;
        this.semanticDiagnostics = [];
        this.uri = uri;
        this.matchResult = null;
        this.reference = reference;

        this.matcher = grammar.matcher();
        this.semanticIndex = 0;
        this.currentFullTextDocument = '';

        this.localQuickCheck = [];
        this.tokenList = [];
        this.jsdocGenerated = {
            description: '',
            isScript: true,
            maxParameters: 999,
            minParameters: -999,
            parameters: [],
            returns: '',
            signature: ''
        };
        this.currentObjectName = '*';
        this.currentObjectRange = Range.create(0, 0, 0, 0);
        this.currentRank = 0;
        this.isSelf = true;

        // Init the Grammar:
        const actionDictionaries: Array<IActionDict> = [];
        actionDictionaries.push({
            name: 'lint',
            actionDict: {
                // Identify functions and get argument counts
                funcIdentifier: (funcId: Node) => {
                    // Check if the function exists:
                    const funcName = funcId.sourceString;

                    const scriptPack = this.reference.scriptGetPackage(funcName);
                    if (scriptPack) {
                        // Add it to the Script's References:
                        this.reference.scriptAddReference(
                            funcName,
                            this.uri,
                            Range.create(
                                getPositionFromIndex(
                                    this.currentFullTextDocument,
                                    this.semanticIndex + funcId.source.startIdx
                                ),
                                getPositionFromIndex(
                                    this.currentFullTextDocument,
                                    this.semanticIndex + funcId.source.endIdx
                                )
                            )
                        );

                        // Get our JSDOC
                        const jsdoc = scriptPack.JSDOC;

                        const thisFunction: GMLFunctionStack = {
                            name: funcName,
                            interval: funcId.source,
                            minParams: jsdoc.minParameters,
                            maxParams: jsdoc.maxParameters,
                            isScript: jsdoc.isScript,
                            exists: true
                        };

                        // Push a real function stack:
                        this.functionStack.push(thisFunction);
                    } else {
                        this.functionStack.push({
                            name: funcName,
                            interval: funcId.source,
                            isScript: false,
                            exists: false
                        });
                    }
                },

                // arugment list works with function list to get errors for argument calls
                Arguments: (_: Node, list: Node, __: Node) => {
                    // If providedArgNumber != 0, then we have a NonEmptyList,
                    // otherwise, we have a list.
                    let iterArray = list.children[0].children;
                    let providedNodeNumber = iterArray.length;
                    let providedArguments: string[] = [];

                    // Convert our Arguments from a Node List to a simple Array of Strings:
                    if (providedNodeNumber != 0) {
                        // Is this necessary? TODO:
                        providedArguments.push(iterArray[0].sourceString.trim());

                        // Iterate through the Rest of the Arguments:
                        for (const thisChild of iterArray[2].children) {
                            providedArguments.push(thisChild.sourceString.trim());
                        }
                    }

                    // Special case for no-argument calls, since otherwise, we'll have an
                    // array which looks like [""].
                    if (providedArguments.length == 1 && providedArguments[0] == '') {
                        providedArguments = [];
                    }

                    // Pop our function...
                    const currentFunc = this.functionStack.pop();

                    // If our function doesn't exist, we call an error on the whole function...
                    if (currentFunc) {
                        if (currentFunc.exists == false) {
                            let eMessage = 'Unknown function/script "' + currentFunc.name + '".';
                            this.semanticDiagnostics.push(
                                this.getFunctionDiagnostic(this.currentFullTextDocument, list, currentFunc, eMessage)
                            );
                        }
                        // Confirm we have the right number of arguments...
                        else if (currentFunc.maxParams && currentFunc.minParams) {
                            // First we push an error if the Array is longer than the number of arguments we want:
                            // This is for the case of `two_arg_function(arg0, arg1,  )` where an extra comma/blank
                            // argument is present.
                            if (providedArguments.length > currentFunc.maxParams) {
                                const eMessage =
                                    'Expected ' +
                                    currentFunc.maxParams +
                                    ' arguments, but got ' +
                                    providedArguments.length +
                                    '.';
                                this.semanticDiagnostics.push(
                                    this.getFunctionDiagnostic(
                                        this.currentFullTextDocument,
                                        list,
                                        currentFunc,
                                        eMessage
                                    )
                                );
                            }

                            // Next, we find the number of empty arguments. We do this both so `two_arg_func(arg0, )`
                            // correctly errors and `three_arg(arg0, , arg2)` errors.

                            // Create an Array of boolean and a running total of non-empty arguments. Once we
                            // encounter an empty argument, we stop counting arguments, and we check if we are at
                            // a sufficient number of arguments.
                            let argsAreEmpty: boolean[] = [],
                                nonEmptyArgs = 0,
                                combo = true;

                            for (const thisArg of providedArguments) {
                                const check = thisArg == '';
                                argsAreEmpty.push(check);

                                // Increment or Break our Combo here:
                                if (!check && combo) {
                                    nonEmptyArgs++;
                                } else {
                                    combo = false;
                                }
                            }

                            // Check how many nonEmptyArgs we have, and if it's enough (we don't check
                            // for ">" because the first check should have caught it):
                            if (nonEmptyArgs < currentFunc.minParams) {
                                const eMessage =
                                    'Expected ' + currentFunc.minParams + ' arguments, but got ' + nonEmptyArgs + '.';

                                // Create our Diagnostic:
                                this.semanticDiagnostics.push(
                                    this.getFunctionDiagnostic(
                                        this.currentFullTextDocument,
                                        list,
                                        currentFunc,
                                        eMessage
                                    )
                                );
                            }

                            // Finally, check if we've got a blank and send an "expression needed" error
                            // to the sorry bastard
                            const eMessage = 'Argument expression expected.';
                            for (let i = 0, l = argsAreEmpty.length; i < l; i++) {
                                const thisArgIsEmpty = argsAreEmpty[i];

                                if (thisArgIsEmpty) {
                                    if (i == 0) {
                                        this.semanticDiagnostics.push(
                                            this.getFunctionDiagnostic(
                                                this.currentFullTextDocument,
                                                iterArray[0],
                                                currentFunc,
                                                eMessage
                                            )
                                        );
                                    } else {
                                        this.semanticDiagnostics.push(
                                            this.getFunctionDiagnostic(
                                                this.currentFullTextDocument,
                                                iterArray[2].child(i - 1),
                                                currentFunc,
                                                eMessage
                                            )
                                        );
                                    }
                                }
                            }
                        }
                    }
                    list.lint();
                },

                // Generic for all non-terminal nodes
                _nonterminal: (children: any) => {
                    children.forEach((element: any) => {
                        element.lint();
                    });
                },

                // Generic for Termins:
                _terminal: function() {
                    return this.sourceString;
                }
            }
        });
        actionDictionaries.push({
            name: 'indexVariables',
            actionDict: {
                // This is the subject in the declaration/set statement: OBJ.VAR = 10;
                ObjDotVar: (thisObject: Node, _, thisVariable: Node) => {
                    let objName = thisObject.sourceString;

                    // Right now, we don't walk this
                    // Next update, we'll add types to try to walk this:
                    if (objName.includes('.') == false) {
                        // The Ariak check
                        const macroVal = this.reference.macroGetMacroValue(objName);
                        if (macroVal) {
                            this.reference.macroAddReference(
                                objName,
                                this.uri,
                                this.getRangeAtNode(this.currentFullTextDocument, thisObject)
                            );
                            objName = macroVal;
                        }

                        // The other check
                        if (objName == 'other') {
                            objName = this.reference.implicitGetLastImplicit(this.uri);
                        }

                        if (this.reference.objectExists(objName) && this.currentObjectName != objName) {
                            // Save our Current Var Parsing State
                            const oldObj = this.currentObjectName;
                            const oldSelf = this.isSelf;

                            // Set to new Stuff
                            this.currentObjectName = objName;
                            this.isSelf = false;

                            // Do the variable thing
                            thisVariable.indexVariables();

                            // Reset
                            this.currentObjectName = oldObj;
                            this.isSelf = oldSelf;
                        }
                    }
                },

                // This is the predicate in a setting statement: x = OBJ.VAR;
                MembObjectVarRef: (thisObject: Node, _, thisVariable: Node) => {
                    let objName = thisObject.sourceString;

                    // Right now, we don't walk this
                    if (objName.includes('.') == false) {
                        // The Ariak check
                        const macroVal = this.reference.macroGetMacroValue(objName);
                        if (macroVal) {
                            this.reference.macroAddReference(
                                objName,
                                this.uri,
                                this.getRangeAtNode(this.currentFullTextDocument, thisObject)
                            );
                            objName = macroVal;
                        }

                        if (this.reference.objectExists(objName) || this.reference.enumExists(objName)) {
                            // Save our Current Var Parsing State
                            const oldObj = this.currentObjectName;
                            const oldSelf = this.isSelf;

                            // Set to new Stuff
                            this.currentObjectName = objName;
                            this.isSelf = false;
                            this.currentObjectRange = this.getRangeAtNode(this.currentFullTextDocument, thisObject);

                            // Do the variable thing
                            thisVariable.indexVariables();

                            // Reset
                            this.currentObjectName = oldObj;
                            this.isSelf = oldSelf;
                            this.currentObjectRange = Range.create(0, 0, 0, 0);
                        }
                    }
                },

                WithStatement: (_, thisObject: Node, Statement: Node) => {
                    // Figure out our Object Name:
                    let objName = thisObject.child(0).sourceString;
                    if (objName.charAt(0) == '(' && objName.charAt(objName.length - 1) == ')') {
                        objName = objName.slice(1, objName.length - 1);
                    }

                    // The Ariak check
                    const macroVal = this.reference.macroGetMacroValue(objName);
                    if (macroVal) {
                        this.reference.macroAddReference(
                            objName,
                            this.uri,
                            this.getRangeAtNode(this.currentFullTextDocument, thisObject)
                        );
                        objName = macroVal;
                    }

                    if (this.reference.objectExists(objName) && this.currentObjectName != objName) {
                        // Save our Current Var Parsing State
                        const oldObj = this.currentObjectName;
                        const oldSelf = this.isSelf;

                        // Set to new Stuff
                        this.currentObjectName = objName;
                        this.isSelf = false;

                        // Add this index to our Implicit list:
                        this.reference.implicitAddImplicitEntry(
                            this.currentObjectName,
                            this.uri,
                            getPositionFromIndex(this.currentFullTextDocument, Statement.source.startIdx)
                        );

                        // Do the variable thing
                        Statement.indexVariables();

                        // Reset
                        this.currentObjectName = oldObj;
                        this.isSelf = oldSelf;

                        // Add back to our new Implicit list:
                        this.reference.implicitAddImplicitEntry(
                            this.currentObjectName,
                            this.uri,
                            getPositionFromIndex(this.currentFullTextDocument, Statement.source.endIdx)
                        );
                    }
                },

                // Handle local variable identification here
                localVariable: (variable: Node) => {
                    const varName = variable.sourceString;
                    if (this.localQuickCheck.includes('*.' + variable.sourceString) == false) {
                        // Add to the Local Quick Check
                        this.localQuickCheck.push('*.' + varName);

                        // Push it to reference:
                        this.reference.localCreateLocal(
                            varName,
                            this.uri,
                            this.getRangeAtNode(this.currentFullTextDocument, variable)
                        );
                    }
                },

                /**
                 * PossibleVariables are `x = POSSIBLE_VAR;` They are
                 * normally just instance variables, but they could also be:
                 * Resources, Macros, script names, whatever man!
                 */
                possibleVariable: (variable: Node) => {
                    this.checkForVariable(variable);
                },

                variable: (variable: Node) => {
                    this.checkForVariable(variable);
                },

                globalVariable: (globVariable: Node) => {
                    this.reference.instAddInstToObject(
                        {
                            name: globVariable.sourceString,
                            range: this.getRangeAtNode(this.currentFullTextDocument, globVariable),
                            object: 'global',
                            supremacy: this.currentRank,
                            isSelf: false
                        },
                        this.uri
                    );
                },

                MacroDeclaration: (hashtag: Node, macroName: Node, macroValue: Node) => {
                    const name = macroName.sourceString;
                    const val = macroValue.sourceString.trim();

                    const thisRange = Range.create(
                        getPositionFromIndex(this.currentFullTextDocument, hashtag.source.startIdx),
                        getPositionFromIndex(this.currentFullTextDocument, macroValue.source.endIdx)
                    );

                    this.reference.macroCreateMacro(name, val, thisRange, this.uri);
                },

                PureMacro: (macroWord: Node, _) => {
                    if (this.reference.macroExists(macroWord.sourceString) == false) {
                        // Get Start Position
                        const startPos = getPositionFromIndex(
                            this.currentFullTextDocument,
                            macroWord.source.startIdx + this.semanticIndex
                        );

                        // Get End Position (add one for colon)
                        const endPos = getPositionFromIndex(
                            this.currentFullTextDocument,
                            macroWord.source.endIdx + this.semanticIndex
                        );

                        // Create return Diagnostic
                        this.semanticDiagnostics.push({
                            severity: DiagnosticSeverity.Error,
                            message: "Expression '" + macroWord.sourceString + "' used as a statement.",
                            source: 'gml',
                            range: Range.create(startPos, endPos)
                        });
                    } else {
                        // Add a reference to the macro
                        this.reference.macroAddReference(
                            macroWord.sourceString,
                            this.uri,
                            this.getRangeAtNode(this.currentFullTextDocument, macroWord)
                        );
                    }
                },

                EnumDeclaration: (enumWord: Node, enumName: Node, _: Node, enumList: Node, cCurly: Node) => {
                    const enumNameString = enumName.source.contents;
                    const thisRange = Range.create(
                        getPositionFromIndex(this.currentFullTextDocument, enumName.source.startIdx),
                        getPositionFromIndex(this.currentFullTextDocument, enumName.source.endIdx)
                    );

                    // Add the Enum to the Reference
                    this.reference.enumCreateEnum(enumNameString, thisRange, this.uri);

                    // Name the Enum
                    this.currentEnumName = enumNameString;
                    this.currentEnumeration = 0;

                    enumList.indexVariables();

                    // Reset
                    this.currentEnumName = null;
                    this.currentEnumeration = 0;
                },

                EnumEntry: (identifier: Node, EnumEnumerated: Node) => {
                    if (!this.currentEnumName) return;

                    // Add the Enum Entry to the Reference
                    this.reference.enumCreateEnumMember(
                        this.currentEnumName,
                        identifier.sourceString,
                        this.uri,
                        Range.create(
                            getPositionFromIndex(this.currentFullTextDocument, identifier.source.startIdx),
                            getPositionFromIndex(this.currentFullTextDocument, identifier.source.endIdx)
                        ),
                        this.currentEnumeration.toString()
                    );
                    this.currentEnumeration++;
                },

                DefineStatement: (defineWord: Node, funcName: Node) => {
                    const startPos = getPositionFromIndex(
                        this.currentFullTextDocument,
                        defineWord.source.startIdx + this.semanticIndex
                    );

                    const endPos = getPositionFromIndex(
                        this.currentFullTextDocument,
                        funcName.source.endIdx + this.semanticIndex
                    );

                    this.semanticDiagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        message: 'Define statement only allowed in GML Extension. We will support this in the future.',
                        range: Range.create(startPos, endPos),
                        source: 'gml'
                    });
                },

                // Generic for all non-terminal nodes
                _nonterminal: (children: any) => {
                    children.forEach((element: any) => {
                        element.indexVariables();
                    });
                },

                // Generic for Termins:
                _terminal: function() {
                    return this.sourceString;
                }
            }
        });

        actionDictionaries.push({
            name: 'jsdoc',
            actionDict: {
                jsdocFunction: (funcDec: Node, _, functionEntry: Node) => {
                    // Provisional usage here:
                    const trimmed = functionEntry.sourceString.trim();
                    if (trimmed.includes('(')) {
                        this.jsdocGenerated.signature = trimmed.slice(0, trimmed.indexOf('('));
                    }
                },

                jsdocDescription: (descDec: Node, _1, descriptionEntry: Node) => {
                    this.jsdocGenerated.description = descriptionEntry.source.contents;
                },

                jsdocParam: (decl, _, typeDecl: Node, _1, paramEntry: Node) => {
                    // const ourType = typeDecl.sourceString;
                    const ourParam = paramEntry.sourceString;

                    // Set up
                    let thisParam: JSDOCParameter = {
                        documentation: '',
                        label: ''
                    };

                    // // Add a type
                    // if (ourType) {
                    // 	thisParam.type = typeDecl.child(0).child(1).sourceString;
                    // }

                    // Add our ParamEntry's first word
                    const ourWords = ourParam.match(/\S+/g);
                    if (ourWords) {
                        thisParam.label = ourWords[0];
                        thisParam.documentation = ourWords.slice(1, ourWords.length).join(' ');
                    }

                    // Push it all:
                    this.jsdocGenerated.parameters.push(thisParam);
                },

                jsdocReturns: (decl, _, desc: Node) => {
                    this.jsdocGenerated.returns = desc.sourceString;
                },

                jsdocGMS1: (
                    slash: Node,
                    _0,
                    jsdocGMS1funcName: Node,
                    _1,
                    _2,
                    paramList: Node,
                    _3,
                    jsdocGMS1desc: Node
                ) => {
                    if (slash.source.startIdx != 0) {
                        return;
                    }

                    // Go and Find the Children
                    let params = paramList.sourceString.replace(/\s/g, '');

                    // Figure out our param names
                    const args = params.split(',');

                    // Add the Parameters
                    for (const thisArg of args) {
                        this.jsdocGenerated.parameters.push({
                            label: thisArg,
                            documentation: ''
                            // type: ""
                        });
                    }

                    // Add the description
                    this.jsdocGenerated.description = jsdocGMS1desc.sourceString.trim();
                },

                identifier: (id: Node) => {
                    const ourID = id.sourceString;

                    if (/\bargument[0-9]+\b/.test(ourID)) {
                        this.jsdocGenerated.minParameters++;
                        this.jsdocGenerated.maxParameters = this.jsdocGenerated.minParameters;
                    }

                    if (/\bargument\[[0-9]+\]/.test(ourID)) {
                        this.jsdocGenerated.minParameters = -9999;
                        this.jsdocGenerated.maxParameters = 9999;
                    }
                },

                DefineStatement: (defineWord: Node, funcName: Node) => {
                    this.jsdocGenerated.signature = funcName.sourceString;
                },

                // Generic for all non-terminal nodes
                _nonterminal: (children: any) => {
                    children.forEach((element: any) => {
                        element.jsdoc();
                    });
                },

                // Generic for Termins:
                _terminal: function() {
                    return this.sourceString;
                }
            }
        });

        // Create our Semantic (general) and add all our operations.
        this.semantics = grammar.createSemantics();
        for (const thisActionDict of actionDictionaries) {
            this.semantics.addOperation(thisActionDict.name, thisActionDict.actionDict);
        }
    }

    private checkForVariable(variable: Node) {
        const varName = variable.sourceString;

        if (this.localQuickCheck.includes('*.' + varName)) {
            this.reference.localPushLocalReference(
                varName,
                this.uri,
                this.getRangeAtNode(this.currentFullTextDocument, variable)
            );
        } else if (this.reference.macroExists(varName)) {
            this.reference.macroAddReference(
                varName,
                this.uri,
                this.getRangeAtNode(this.currentFullTextDocument, variable)
            );
        } else if (this.reference.resourceExists(varName)) {
            // We're a resource, and we don't know what to do with these yet!
        } else if (this.reference.enumMemberExists(this.currentObjectName, varName)) {
            // We're an enumMember
            // objectName is the enum name
            // varName is the enumMember name
            this.reference.enumPushEnumMemberReference(
                this.currentObjectName,
                varName,
                this.uri,
                this.getRangeAtNode(this.currentFullTextDocument, variable)
            );

            // Add the Enum
            this.reference.enumPushEnumReference(this.currentObjectName, this.uri, this.currentObjectRange);
        } else {
            // Therefore, we are an instance variable after *all* that, yeah?
            this.reference.instAddInstToObject(
                {
                    name: varName,
                    range: this.getRangeAtNode(this.currentFullTextDocument, variable),
                    object: this.currentObjectName,
                    supremacy: this.currentRank,
                    isSelf: this.isSelf
                },
                this.uri
            );
        }
    }

    //#region Encapsulated Ohm functions:
    public getInput(): string {
        return this.matcher.getInput();
    }

    public setInput(str: string): void {
        this.currentFullTextDocument = normalizeEoLSequences(str);
        this.matcher.setInput(this.currentFullTextDocument);
    }

    public replaceInputRange(range: Range, fullDocumentText: string): void {
        // Convert Range to Absolute Position:
        let startIdx = getIndexFromPosition(fullDocumentText, range.start);
        let endIdx = getIndexFromPosition(fullDocumentText, range.end);

        this.matcher.replaceInputRange(startIdx, endIdx, fullDocumentText);
        this.currentFullTextDocument = this.matcher.getInput();
    }

    /**
     * Run Ohm's match function on the internally held matcher string.
     * Returns true if the matchResult succeeds.
     */
    public match(startRule?: string): boolean {
        this.matchResult = this.matcher.match(startRule);
        return this.matchResult.succeeded();
    }
    //#endregion

    /**
     * Returns the internal MatchResult.
     */
    public getMatchResult() {
        return this.matchResult;
    }
    /**
     * If the given matchresult is a failure, we lint through it and try to
     * cut it up into as many succesful matches. We place the succesful
     * matches into the supplied LintPackage ID. Use the LintPackage now to retrieve
     * the data held within.
     */
    public async primarySyntaxLint(lPack: LintPackage) {
        // Make sure we have a MatchResult:
        if (this.matchResult == null) {
            throw 'ERROR you passed a LintPackage without an MatchResult!';
        }

        // Add our memoTable to the DiagnosticTable:
        this.tokenList = [];
        this.tokenList = await this.createSignatureTokenList(this.matcher.memoTable);

        // Regex setup
        const backwardLookup = new RegExp(/;|}|#macro.*/);

        // Initialize loop variables
        let diagnostics: Diagnostic[] = [];
        let salvagedMatchResults: Array<MatchResultsPackage> = [];

        const fullTextDoc = this.matcher.getInput();
        let currentFailure = this.matchResult.getRightmostFailurePosition();
        let forwardFullTextBlock = fullTextDoc;
        let didPassLint = false;
        let sliceIndex = 0;

        while (didPassLint == false) {
            diagnostics.push(this.getDiagnosticAtFailure(fullTextDoc, currentFailure + sliceIndex));

            // #region Cut Up here
            /**
             * We cut upwards here, trying to find the last safe position, using our last last safe
             * position as our first point, trying to find an appropriate last point.
             */
            let possibleSafeEndPosition = regexLastIndexOf(
                fullTextDoc,
                backwardLookup,
                currentFailure + sliceIndex + 1
            );
            let attemptWalkBack = possibleSafeEndPosition - sliceIndex + 1 <= 0 ? false : true;
            if (attemptWalkBack) {
                this.matcher.replaceInputRange(
                    possibleSafeEndPosition - sliceIndex,
                    this.matcher.getInput().length,
                    ''
                );

                let successFoundAbove = true;
                while (this.match() == false) {
                    const oldEndPos = possibleSafeEndPosition;
                    possibleSafeEndPosition = lastIndexOfArray(fullTextDoc, [';', '}'], possibleSafeEndPosition - 1);

                    if (possibleSafeEndPosition - sliceIndex + 1 <= 0) {
                        successFoundAbove = false;
                        break;
                    }
                    this.matcher.replaceInputRange(
                        possibleSafeEndPosition + 1 - sliceIndex,
                        oldEndPos - sliceIndex,
                        ''
                    );
                }
                // If we found success in the above matchResults, then we push it along:
                if (successFoundAbove)
                    this.pushToSalvagedMatchResults(sliceIndex, possibleSafeEndPosition, salvagedMatchResults);
                //#endregion
            }

            // Go below the failure...
            sliceIndex = regexIndexOf(fullTextDoc, /(\n|;|{)/, currentFailure + sliceIndex);
            if (sliceIndex == -1) {
                didPassLint = false;
                break;
            }

            // Reset Variables
            forwardFullTextBlock = fullTextDoc.slice(sliceIndex);
            this.matcher.setInput(forwardFullTextBlock);
            didPassLint = this.match();
            currentFailure = this.matchResult.getRightmostFailurePosition();
        }

        // Add a final matchResult if we can
        if (didPassLint) this.pushToSalvagedMatchResults(sliceIndex, fullTextDoc.length - 1, salvagedMatchResults);

        // Set the Lint Package:
        lPack.set(diagnostics, salvagedMatchResults);
    }

    /**
     * Packages the succesful match and sends it to the
     * supplied array. Simply put into a method for organization.
     */
    private pushToSalvagedMatchResults(
        sliceIndex: number,
        possibleSafeEndPosition: number,
        salvagedMatchResults: MatchResultsPackage[]
    ) {
        // Add to the array:
        let indexPosition: IndexRange = {
            startIndex: sliceIndex,
            endIndex: possibleSafeEndPosition + sliceIndex
        };

        salvagedMatchResults.push({
            indexRange: indexPosition,
            matchResult: this.matchResult
        });
    }

    /**
     * Reads (but does not destroy) the semanticDiagnostics internally held.
     */
    public readSemanticDiagnostics() {
        return this.semanticDiagnostics.slice();
    }

    /**
     * Reads and clears the semanticDiagnostics
     */
    public popSemanticDiagnostics() {
        let ret = this.readSemanticDiagnostics();
        this.clearSemanticDiagnostics();

        return ret;
    }

    /**
     * Clears without reading the SemanticDiagnostics
     */
    public clearSemanticDiagnostics() {
        this.semanticDiagnostics.length = 0;
        this.semanticIndex = 0;
    }

    public get getURI(): string {
        return this.uri;
    }

    /**
     * Returns a diagnostic from the current failure.
     */
    private getDiagnosticAtFailure(textDoc: string, currentFailure: number): Diagnostic {
        let pos = getPositionFromIndex(textDoc, currentFailure);

        // Sometimes ohm fails us if we're going to fast. Not sure why,
        // but we do this for safety.
        let mess: string;
        try {
            mess = this.matchResult.shortMessage;
        } catch (error) {
            mess = 'Error: unexpected symbol';
        }

        // Initial result TODO: make this a little recursive
        return {
            severity: DiagnosticSeverity.Error,
            message: mess,
            source: 'gml',
            range: Range.create(pos, pos)
        };
    }

    private getFunctionDiagnostic(
        fullTextDocument: string,
        node: Node,
        currentFunc: GMLFunctionStack,
        errorMessage: string
    ): Diagnostic {
        // Combine the function interval and the argument interval
        const functionInterval = node.source.coverageWith(currentFunc.interval, node.source);

        // Get Start Position
        const startPos = getPositionFromIndex(fullTextDocument, functionInterval.startIdx + this.semanticIndex);

        // Get End Position (add one for last parenthesis)
        const endPos = getPositionFromIndex(fullTextDocument, functionInterval.endIdx + this.semanticIndex + 1);

        // Create return Diagnostic
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            message: errorMessage,
            source: 'gml',
            range: Range.create(startPos, endPos)
        };

        return diagnostic;
    }

    private getRangeAtNode(fullTextDoc: string, thisNode: Node) {
        const startPos = getPositionFromIndex(fullTextDoc, thisNode.source.startIdx + this.semanticIndex);
        const endPos = getPositionFromIndex(fullTextDoc, thisNode.source.endIdx + this.semanticIndex);

        return Range.create(startPos, endPos);
    }

    //#region Semantic Operations
    /**
     * Runs the Lint semantic action on the supplied MatchResults.
     */
    public async runSemanticLintOperation(matchArray: MatchResultsPackage[]) {
        for (const element of matchArray) {
            this.semanticIndex = element.indexRange.startIndex;
            await this.semantics(element.matchResult).lint();
        }
    }

    public async runSemanticIndexVariableOperation(matchArray: MatchResultsPackage[], currObjInfo: DocumentFolder) {
        // Clear the quick check
        this.localQuickCheck = [];

        // Set our Object Name Here:
        this.currentObjectName = currObjInfo.name;

        // Save that current implicit object to our list:
        this.reference.implicitAddImplicitEntry(this.currentObjectName, this.uri, Position.create(0, 0));

        // Figure our our Variable Type for this Event/Script and this Object:
        if (currObjInfo.eventInfo) {
            if (currObjInfo.eventInfo.eventType == EventType.Create) {
                this.currentRank = VariableRank.Create;
            } else if (currObjInfo.eventInfo.eventType == EventType.Step) {
                switch (currObjInfo.eventInfo.eventNumb) {
                    case EventNumber.StepBegin:
                        this.currentRank = VariableRank.BegStep;
                        break;

                    case EventNumber.StepNormal:
                        this.currentRank = VariableRank.Step;
                        break;

                    case EventNumber.StepEnd:
                        this.currentRank = VariableRank.EndStep;
                        break;
                }
            } else {
                this.currentRank = VariableRank.Other;
            }
        } else this.currentRank = VariableRank.Other;

        // Main loop
        for (const element of matchArray) {
            this.semanticIndex = element.indexRange.startIndex;
            await this.runIndexVariableOperation(element.matchResult);
        }
    }

    /**
     * Runs the "indexVariables" action, returning an object of
     * all the instance variables and all the global variables.
     */
    private async runIndexVariableOperation(matchResult: MatchResult) {
        this.semantics(matchResult).indexVariables();
    }

    public async runSemanticJSDOC(matchArray: MatchResultsPackage[], name: string) {
        // Clear past JSDOC
        this.jsdocGenerated = {
            description: '',
            isScript: true,
            minParameters: 0,
            maxParameters: 9999,
            parameters: [],
            returns: '',
            signature: ''
        };

        for (const element of matchArray) {
            this.semanticIndex = element.indexRange.startIndex;
            await this.semantics(element.matchResult).jsdoc();
        }

        this.jsdocGenerated.signature = name;

        return this.jsdocGenerated;
    }

    public async runSemanticExtensionJSDOC(matchResult: MatchResult) {
        // Clear past JSDOC
        this.jsdocGenerated = {
            description: '',
            isScript: true,
            minParameters: 0,
            maxParameters: 9999,
            parameters: [],
            returns: '',
            signature: ''
        };

        await this.semantics(matchResult).jsdoc();
        return this.jsdocGenerated;
    }

    // #endregion

    public async createSignatureTokenListGoodMatch() {
        this.tokenList = [];
        this.tokenList = await this.createSignatureTokenList(this.matcher.memoTable);
    }

    private async createSignatureTokenList(thisTable: any[]): Promise<Token[]> {
        const l = thisTable.length;
        let i = 0;
        let ourTokens: Token[] = [];

        // Main Loop
        while (i < l) {
            const thisPosInfo = thisTable[i];
            try {
                if (thisPosInfo) {
                    if (thisPosInfo.memo.oParens && thisPosInfo.memo.oParens.value !== false) {
                        ourTokens.push({
                            tokenName: 'oParens',
                            startIdx: i,
                            length: 1
                        });
                        i++;
                        continue;
                    }

                    if (thisPosInfo.memo.Function && thisPosInfo.memo.Function.value !== false) {
                        // Make sure this is a real funIdentifier
                        if (thisPosInfo.memo.funcIdentifier && thisPosInfo.memo.funcIdentifier.value !== false) {
                            const length = thisPosInfo.memo.funcIdentifier.matchLength;
                            ourTokens.push({
                                tokenName: 'funcIdentifier',
                                startIdx: i,
                                length: length
                            });
                            i += length;
                            continue;
                        }
                    }

                    if (thisPosInfo.memo.cParens && thisPosInfo.memo.cParens.value !== false) {
                        ourTokens.push({
                            tokenName: 'cParens',
                            startIdx: i,
                            length: 1
                        });
                        i++;
                        continue;
                    }

                    if (thisPosInfo.memo.comma && thisPosInfo.memo.comma.value !== false) {
                        ourTokens.push({
                            tokenName: 'comma',
                            startIdx: i,
                            length: 1
                        });
                        i++;
                        continue;
                    }
                }
            } catch (error) {
                console.log(error);
            }
            i++;
        }
        return ourTokens;
    }

    public getTokenList(): Token[] {
        return this.tokenList;
    }
}
