import { Interval, Node, Grammar, MatchResult, ActionDict, Semantics } from "ohm-js";
import { Diagnostic, Range, DiagnosticSeverity } from "vscode-languageserver/lib/main";
import { lastIndexOfArray, normalizeEoLSequences, regexIndexOf, getIndexFromPosition, getPositionFromIndex, timeUtil } from "./utils";
import { Reference } from "./reference";
import { JSDOC, JSDOCParameter } from "./fileSystem";
import { Token, enumsMacros } from "./declarations";


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
    readonly name: string, 
    readonly interval: Interval, 
    readonly isScript: boolean, 
    readonly exists?: boolean
    readonly params?: number, 
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
    variables: Array<GMLVariableLocation>,
    globalVariables: Array<GMLVariableLocation>,
    localVariables: Array<GMLVariableLocation>
}

export abstract class LintPackageFactory {
    static create(diag: Diagnostic[], matchRess: MatchResultsPackage[]) {
        return new LintPackage(diag, matchRess);
    }
    static createBlank(): LintPackage {
        let diag: Diagnostic[] = [];
        let matchRes: MatchResultsPackage[] = undefined;

        return new LintPackage(diag, matchRes);
    }
}

export interface IActionDict {
    actionDict: ActionDict;
    name: string;
}

export interface GMLVariableLocation {
    name: string;
    range: Range;
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

    constructor(diag: Diagnostic[], matchRess: MatchResultsPackage[]) {
        this.diagnostics = diag;
        this.matchResults = matchRess;
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
    private localVariables: Array<GMLVariableLocation>;
    private instanceVariables: Array<GMLVariableLocation>;
    private localQuickCheck: Array<string>;
    private instanceQuickCheck: Array<string>;
    private globalVariables: Array<GMLVariableLocation>;
    private globalQuickCheck: Array<string>;
    private functionStack: Array<GMLFunctionStack>;
    private semanticDiagnostics: Diagnostic[];
    private matcher: any; // Matcher, but with more stuff.
    private actionDictionaries: Array<IActionDict>;
    private matchResult: any; // MatchResult but with more stuff.
    private semantics: Semantics;
    private semanticIndex: number;
    private currentFullTextDocument: string;
    /** Avoid using this hanlde as much as possible. Should be eliminated asap. */
    private reference: Reference;
    /** Enums pushed go here.  */
    private enumsAddedThisCycle: Array<string>;
    /** Macros pushed go here. */
    private macrosAddedThisCycle: Array<MacroPackage>;
    /** If this is a script, it will run this and try to generate JsDoc. */
    private jsdocGenerated:JSDOC;
    private tokenList: Token[];

    // Constructor:
    constructor(grammar: Grammar, uri: string, reference: Reference) {
        this.localVariables = [];
        this.instanceVariables = [];
        this.globalVariables = [];
        this.functionStack = [];
        this.semanticDiagnostics = [];
        this.uri = uri;
        this.matchResult = null;
        this.reference = reference;

        this.matcher = grammar.matcher();
        this.semanticIndex = 0;
        this.currentFullTextDocument = "";
        this.actionDictionaries = [];

        this.initActionDictionaries(grammar);
    }

    private initActionDictionaries(grammar: Grammar) {
        // Add Action-Dictionary:
        this.actionDictionaries.push({ 
            name: "lint", 
            actionDict: {
                // Identify functions and get argument counts
                funcIdentifier: (funcId: Node) => {
                    // Check if the function exists:
                    const funcName = funcId.sourceString;

                    if (this.reference.scriptExists(funcName)) {
                        let jsdoc = this.reference.scriptGetScriptPackage(funcName).JSDOC;
                        
                        let thisFunction: GMLFunctionStack = {
                            name: funcName,
                            interval: funcId.source,
                            params: jsdoc.parameterCount,
                            isScript: jsdoc.isScript,
                            exists: true
                        }

                        // Push a real function stack:
                        this.functionStack.push(thisFunction);
                    } else {
                        this.functionStack.push({
                            name: funcName,
                            interval: funcId.source,
                            params: 0,
                            isScript: null,
                            exists: false
                        })
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
                    if (providedArguments.length == 1 && providedArguments[0] == "") {
                        providedArguments = [];
                    }

                    // Pop our function...
                    var currentFunc = this.functionStack.pop();
    
                    // If our function doesn't exist, we call an error on the whole function...
                    if (currentFunc.exists == false) {
                        let eMessage = 'Unknown function/script "' + currentFunc.name + '".';
                        this.semanticDiagnostics.push(
                            this.getFunctionDiagnostic(this.currentFullTextDocument, list, currentFunc, eMessage)
                        );
                    }
                    // Confirm we have the right number of arguments...
                    else {
                        // First we push an error if the Array is longer than the number of arguments we want:
                        // This is for the case of `two_arg_function(arg0, arg1,  )` where an extra comma/blank 
                        // argument is present.
                        if (providedArguments.length > currentFunc.params) {
                            const eMessage = "Expected " + currentFunc.params + " arguments, but got " + providedArguments.length + ".";
                            this.semanticDiagnostics.push(
                                this.getFunctionDiagnostic(this.currentFullTextDocument, list, currentFunc, eMessage)
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
                            const check = thisArg == ""
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
                        if (nonEmptyArgs < currentFunc.params) {
                            const eMessage = "Expected " + currentFunc.params + " arguments, but got " + nonEmptyArgs + ".";

                            // Create our Diagnostic:
                            this.semanticDiagnostics.push(
                                this.getFunctionDiagnostic(this.currentFullTextDocument, list, currentFunc, eMessage)
                            );
                        }
                        
                        // Finally, check if we've got a blank and send an "expression needed" error
                        // to the sorry bastard
                        const eMessage = "Argument expression expected."
                        for (let i = 0, l = argsAreEmpty.length; i < l; i++) {
                            const thisArgIsEmpty = argsAreEmpty[i];

                            if (thisArgIsEmpty) {
                                if (i == 0) {
                                    this.semanticDiagnostics.push(
                                        this.getFunctionDiagnostic(this.currentFullTextDocument, iterArray[0], currentFunc, eMessage)
                                    ); 
                                } else {
                                    this.semanticDiagnostics.push(
                                        this.getFunctionDiagnostic(this.currentFullTextDocument, iterArray[2].child(i - 1), currentFunc, eMessage)
                                    ); 
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
        this.actionDictionaries.push({
            name: "indexVariables",
            actionDict: {
                // Handle local variable identification here
                localVariable: (variable: Node) => {
                    const varName = variable.sourceString;
                    if (this.localQuickCheck.includes(variable.sourceString) == false) {
                        this.localQuickCheck.push(varName);
                        this.localVariables.push({
                            name: varName,
                            range: this.getVariableIndex(this.currentFullTextDocument, variable)
                        });
                    }
                },

                variable: (variable: Node) => {
                    const variableName = variable.sourceString;

                    if (this.instanceQuickCheck.includes(variableName) == false && this.localQuickCheck.includes(variableName) == false) {
                        // Add our new object
                        this.instanceVariables.push({
                            name: variableName,
                            range: this.getVariableIndex(this.currentFullTextDocument, variable)
                        });
                        this.instanceQuickCheck.push(variableName);
                    }
                },
    
                globalVariable: (globVariable: Node) => {
                    if (this.globalQuickCheck.includes(globVariable.sourceString) == false) {
                        this.globalVariables.push({
                            name: globVariable.sourceString,
                            range: this.getVariableIndex(this.currentFullTextDocument, globVariable)
                        })
                        this.globalQuickCheck.push(globVariable.sourceString);
                    }
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
        this.actionDictionaries.push({
            name: "enumsAndMacros",
            actionDict: {
                EnumDeclaration: (enumWord: Node, enumName: Node, _: Node, enumList: Node, cCurly: Node) => {
                    const enumNameString = enumName.source.contents;
                    const thisRange= Range.create(
                        getPositionFromIndex(this.currentFullTextDocument, enumWord.source.startIdx), 
                        getPositionFromIndex(this.currentFullTextDocument, cCurly.source.endIdx)
                    );

                    this.reference.addEnum(enumNameString, thisRange, this.uri);
                    this.addEnumEntries(enumNameString, enumList);

                    // Add it to our list.
                    this.enumsAddedThisCycle.push(enumNameString);
                },

                MacroDeclaration: (hashtag: Node, macroName: Node, macroValue: Node, _) => {
                    const name = macroName.sourceString;
                    const val = macroValue.
                    sourceString;

                    this.macrosAddedThisCycle.push({
                        macroName: macroName.sourceString,
                        macroValue: macroValue.sourceString
                    });

                    const thisRange = Range.create(
                        getPositionFromIndex(this.currentFullTextDocument, hashtag.source.startIdx),
                        getPositionFromIndex(this.currentFullTextDocument, macroValue.source.endIdx)
                    );

                    this.reference.addMacro(name, val, thisRange, this.uri);
                },

                // Generic for all non-terminal nodes
                _nonterminal: (children: any) => {
                    children.forEach((element: any) => {
                        element.enumsAndMacros();
                    });
                },
    
                // Generic for Termins:
                _terminal: function() {
                    return this.sourceString;
                }

            }
        });
        this.actionDictionaries.push({
            name: "jsdoc",
            actionDict: {
                jsdocFunction: (funcDec: Node, _, functionEntry: Node) => {
                    // Provisional usage here:
                    const trimmed = functionEntry.sourceString.trim();
                    if (trimmed.includes("(")) {
                        this.jsdocGenerated.signature = trimmed.slice(0, trimmed.indexOf("("));
                    }
                },

                jsdocDescription: (descDec: Node, _1, descriptionEntry: Node) => {
                    this.jsdocGenerated.description = descriptionEntry.source.contents;
                },

                jsdocParam: (decl, _, typeDecl: Node, _1, paramEntry: Node) => {
                    const ourType = typeDecl.sourceString;
                    const ourParam= paramEntry.sourceString;

                    // Set up
                    this.jsdocGenerated.parameterCount++;
                    let thisParam: JSDOCParameter = {
                        documentation: "",
                        label: "",
                        type: ""
                    }

                    // Add a type
                    if (ourType) {
                        thisParam.type = typeDecl.child(0).child(1).sourceString;
                    }

                    // Add our ParamEntry's first word
                    const ourWords = ourParam.match(/\S+/g);
                    thisParam.label = ourWords[0];
                    thisParam.documentation = ourWords.slice(1, ourWords.length).join(" ");

                    // Push it all:
                    this.jsdocGenerated.parameters.push(thisParam);

                },

                jsdocReturns: (decl, _, desc: Node) => {
                    this.jsdocGenerated.returns = desc.sourceString;
                },

                jsdocGMS1: (slash: Node, _0, jsdocGMS1funcName: Node, _1, _2, paramList: Node, _3, jsdocGMS1desc: Node) => {
                    if (slash.source.startIdx != 0) {
                        return;
                    }

                    // Go and Find the Children
                    let params = paramList.sourceString.replace(/\s/g,'');

                    // Figure out our param names
                    const args = params.split(',');
                    this.jsdocGenerated.parameterCount = args.length;

                    // Add the Parameters
                    for (const thisArg of args) {
                        this.jsdocGenerated.parameters.push({
                            label: thisArg,
                            documentation: "",
                            type: ""
                        })
                    }

                    // Add the description
                    this.jsdocGenerated.description = jsdocGMS1desc.sourceString.trim();
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
        })

        // Create our Semantic (general) and add all our operations.
        this.semantics = grammar.createSemantics();
        for (const thisActionDict of this.actionDictionaries) {
            this.semantics.addOperation(thisActionDict.name, thisActionDict.actionDict);
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
            throw "ERROR you passed a LintPackage without an MatchResult!";
        }

        // Add our memoTable to the DiagnosticTable:
        this.tokenList = [];
        this.tokenList = await this.createSignatureTokenList(this.matcher.memoTable);


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

            // #region Second While Loop
            let possibleSafeEndPosition = lastIndexOfArray(fullTextDoc, [";", "}"], currentFailure + sliceIndex)
            let attemptWalkBack = (possibleSafeEndPosition  - sliceIndex + 1 <= 0) ? false : true;
            if (attemptWalkBack) {
                this.matcher.replaceInputRange(possibleSafeEndPosition - sliceIndex, this.matcher.getInput().length, "");


                let successFoundAbove = true;
                while (this.match() == false) {
                    const oldEndPos = possibleSafeEndPosition;
                    possibleSafeEndPosition = lastIndexOfArray(fullTextDoc, [";", "}"], possibleSafeEndPosition - 1);
                    if (possibleSafeEndPosition  - sliceIndex + 1 <= 0) {
                        successFoundAbove = false;
                        break;
                    }
                    this.matcher.replaceInputRange(possibleSafeEndPosition + 1 - sliceIndex, oldEndPos - sliceIndex, "");
                }
                // If we found success in the above matchResults, then we push it along:
                if (successFoundAbove) this.pushToSalvagedMatchResults(sliceIndex, possibleSafeEndPosition, salvagedMatchResults);
                //#endregion
            }

            // Go below the failure...
            sliceIndex = regexIndexOf(fullTextDoc, /(;|{)/, currentFailure + sliceIndex);
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
        if (didPassLint) this.pushToSalvagedMatchResults(sliceIndex, fullTextDoc.length-1, salvagedMatchResults);
        
        // Set the Lint Package:
        lPack.set(diagnostics, salvagedMatchResults);
    }

    /**
     * Packages the succesful match and sends it to the 
     * supplied array. Simply put into a method for organization.
     */
    private pushToSalvagedMatchResults(sliceIndex: number, possibleSafeEndPosition: number, salvagedMatchResults: MatchResultsPackage[]) {
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

        // Initial result TODO: make this a little recursive
        return {
            severity: DiagnosticSeverity.Error,
            message: this.matchResult.shortMessage,
            source: "gml",
            range: Range.create(pos, pos)
        };
    }

    private getFunctionDiagnostic(fullTextDocument: string, node: Node, currentFunc: GMLFunctionStack, errorMessage: string): Diagnostic {
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
            source: "gml",
            range: Range.create(startPos, endPos)
        };

        return diagnostic;
    }

    private getVariableIndex(fullTextDoc: string, varNode: Node) {
        const startPos = getPositionFromIndex(fullTextDoc, varNode.source.startIdx + this.semanticIndex);
        const endPos = getPositionFromIndex(fullTextDoc, varNode.source.endIdx + this.semanticIndex);

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
        };
    }

    public async runSemanticEnumsAndMacros(matchArray: MatchResultsPackage[]): Promise<enumsMacros> {
        this.enumsAddedThisCycle = [];
        this.macrosAddedThisCycle= [];

        for (const thisMatch of matchArray) {
            this.semanticIndex = thisMatch.indexRange.startIndex;
            await this.runEnumsAndMacros(thisMatch.matchResult);
        }

        return [this.enumsAddedThisCycle, this.macrosAddedThisCycle];
    }

    public async runEnumsAndMacros(matchResults: MatchResult) {
        await this.semantics(this.matchResult).enumsAndMacros();
    }

    public addEnumEntries(enumName: string, enumList: Node) {
        let iterArray = enumList.children[0].children;
        let providedNodeNumber = iterArray.length;

        if (providedNodeNumber == 0) {
            return;
        }

        // Enum entry #1:
        let thisEnumeration = 0;
        if (iterArray[0].child(1).numChildren != 0) {
            thisEnumeration = Number(iterArray[0].child(1).child(0).child(1).sourceString);
        }

        this.reference.pushEnumEntry(enumName, iterArray[0].children[0].source.contents, this.uri, thisEnumeration);

        // Rest of the Enums:
        iterArray[2].children.forEach(child => {
            // Are we ennumerated?
            if (child.child(1).numChildren != 0) {
                thisEnumeration = Number(child.child(1).child(0).child(1).sourceString);
                this.reference.pushEnumEntry(enumName, child.child(0).sourceString, this.uri, thisEnumeration)
            } else {
                thisEnumeration++;
                this.reference.pushEnumEntry(enumName, child.source.contents, this.uri, thisEnumeration);
            }
        });

    }

    public async runSemanticIndexVariableOperation(matchArray: MatchResultsPackage[]): Promise<VariablesPackage> {
        // Clear the quick check
        this.instanceQuickCheck = [];
        this.globalQuickCheck = [];
        this.localQuickCheck = [];

        // Main loop
        for (const element of matchArray) {
            this.semanticIndex = element.indexRange.startIndex;
            await this.runIndexVariableOperation(element.matchResult);
        };

        return {
            localVariables: this.localVariables.splice(0),
            variables: this.instanceVariables.splice(0, this.instanceVariables.length),
            globalVariables: this.globalVariables.splice(0, this.globalVariables.length)
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
            description : "",
            isScript : true,
            parameterCount : 0,
            parameters : [],
            returns : "",
            signature: ""
        }

        for (const element of matchArray) {
            this.semanticIndex = element.indexRange.startIndex;

            await this.semantics(this.matchResult).jsdoc();
        };

        // Create Signature here (kinda crappy):
        if (this.jsdocGenerated.signature === "") {
            this.jsdocGenerated.signature = name;
        }
        this.jsdocGenerated.signature += "(";

        // Add up params:
        for (let i = 0, l = this.jsdocGenerated.parameterCount; i < l; i++) {
            const element = this.jsdocGenerated.parameters[i];

            this.jsdocGenerated.signature+= element.label;
            this.jsdocGenerated.signature+= i == l-1 ? "" : ", ";
        }
        this.jsdocGenerated.signature+= ")";


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
                            tokenName: "oParens",
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
                                tokenName: "funcIdentifier",
                                startIdx: i,
                                length: length
                            });
                            i+= length;
                            continue;
                        }
                    }

                    if (thisPosInfo.memo.cParens && thisPosInfo.memo.cParens.value !== false) {
                        ourTokens.push({
                            tokenName: "cParens",
                            startIdx: i,
                            length: 1
                        });
                        i++;
                        continue;
                    }

                    if (thisPosInfo.memo.comma && thisPosInfo.memo.comma.value !== false) {
                        ourTokens.push({
                            tokenName: "comma",
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