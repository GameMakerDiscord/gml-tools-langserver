import { Reference } from './Reference/reference';
import { FileSystem } from './fileSystem';
import {
    CompletionItem,
    CompletionList,
    CompletionItemKind,
    CompletionParams,
    CompletionTriggerKind,
    Range,
    MarkupContent,
    MarkupKind
} from 'vscode-languageserver';
import { getWordAtPositionFS } from './utils';
import { OtherResources, JSDOC } from './declarations';

export class GMLCompletionProvider {
    private completionList: CompletionList;

    constructor(private reference: Reference, private fs: FileSystem) {
        this.reference = reference;
        this.fs = fs;

        this.completionList = {
            isIncomplete: true,
            items: []
        };
    }

    public async onCompletionRequest(params: CompletionParams) {
        this.completionList.items.length = 0;
        if (params.context) {
            switch (params.context.triggerKind) {
                case CompletionTriggerKind.Invoked:
                    await this.nonPeriodCompletion(params);
                    break;

                case CompletionTriggerKind.TriggerCharacter:
                    await this.periodCompletion(params);
                    break;

                case CompletionTriggerKind.TriggerForIncompleteCompletions:
                    await this.nonPeriodCompletion(params);
                    break;
            }
        }

        if (params.context && params.context.triggerKind == CompletionTriggerKind.TriggerCharacter) {
            this.periodCompletion(params);
        } else this.nonPeriodCompletion(params);

        return this.completionList;
    }

    private async nonPeriodCompletion(params: CompletionParams) {
        const thisWord = await getWordAtPositionFS(params.textDocument.uri, params.position, this.fs);
        if (!thisWord) return;
        // Backtrack for period in word, when user backspaces after typing a period.
        if (thisWord.includes('.')) {
            return this.periodCompletion(params);
        }

        const thisRange = Range.create(params.position, params.position);

        let workingArray: CompletionItem[] = [];
        const rx = new RegExp('^' + thisWord);

        // Find our Implicit
        const thisImplicitName = await this.reference.implicitGetCurrentImplicitEntry(params.textDocument.uri, params.position);

        // Iterate on the Instance Variables:
        if (thisImplicitName) {
            const variableList = this.reference.objectGetAllInsts(thisImplicitName);

            // Send our Insts out:
            for (const thisItem of variableList) {
                if (rx.test(thisItem) === true) {
                    const orig = this.reference.instGetOriginLocation(thisImplicitName, thisItem);
                    if (
                        orig &&
                        (orig.range.start.line !== thisRange.start.line && orig.range.start.character !== thisRange.start.character)
                    ) {
                        workingArray.push({
                            label: thisItem,
                            kind: CompletionItemKind.Variable,
                            textEdit: {
                                newText: thisItem.replace(thisWord, ''),
                                range: thisRange
                            }
                        });
                    }
                }
            }
        }

        // Iterate on the Local Variables:
        const locals = this.reference.localGetAllLocalsAtURI(params.textDocument.uri);
        if (locals) {
            for (const thisItem of locals) {
                if (rx.test(thisItem) === true) {
                    const orig = this.reference.localGetOrigin(params.textDocument.uri, thisItem);
                    if (
                        orig &&
                        (orig.range.start.line !== thisRange.start.line && orig.range.start.character !== thisRange.start.character)
                    ) {
                        workingArray.push({
                            label: thisItem,
                            kind: CompletionItemKind.Field,
                            textEdit: {
                                newText: thisItem.replace(thisWord, ''),
                                range: thisRange
                            }
                        });
                    }
                }
            }
        }

        // Functions
        const functionList = this.reference.functionGetAllFunctionNames();
        for (const item of functionList) {
            if (item && rx.test(item) === true) {
                workingArray.push({
                    label: item,
                    kind: CompletionItemKind.Function,
                    textEdit: {
                        newText: item.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // Scripts
        const scriptList = this.reference.scriptGetAllScriptNames();
        for (const thisItem of scriptList) {
            if (thisItem && rx.test(thisItem) === true) {
                workingArray.push({
                    label: thisItem,
                    kind: CompletionItemKind.Function,
                    textEdit: {
                        newText: thisItem.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // Extensions
        const extensionList = this.reference.extensionGetAllExtensionNames();
        for (const thisItem of extensionList) {
            if (thisItem && rx.test(thisItem) === true) {
                workingArray.push({
                    label: thisItem,
                    kind: CompletionItemKind.Function,
                    textEdit: {
                        newText: thisItem.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // Objects
        const objectList = this.reference.objectGetList();
        for (const thisItem of objectList) {
            if (rx.test(thisItem) === true) {
                workingArray.push({
                    label: thisItem,
                    kind: CompletionItemKind.Class,
                    textEdit: {
                        newText: thisItem.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // Enums:
        const enumList = this.reference.enumGetEnumList();
        for (const thisItem of enumList) {
            if (rx.test(thisItem) === true) {
                workingArray.push({
                    label: thisItem,
                    kind: CompletionItemKind.Enum,
                    textEdit: {
                        newText: thisItem.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // Macros
        const macroList = this.reference.getMacroList();
        for (const thisItem of macroList) {
            if (rx.test(thisItem) === true) {
                workingArray.push({
                    label: thisItem,
                    kind: CompletionItemKind.Constant,
                    textEdit: {
                        newText: thisItem.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // All other resources:
        const otherResources: OtherResources[] = [];
        otherResources.push([this.reference.getAllResourceOfType('GMSprite'), CompletionItemKind.Color]);
        otherResources.push([this.reference.getAllResourceOfType('GMTileSet'), CompletionItemKind.Struct]);
        otherResources.push([this.reference.getAllResourceOfType('GMSound'), CompletionItemKind.Interface]);
        otherResources.push([this.reference.getAllResourceOfType('GMPath'), CompletionItemKind.Unit]);
        otherResources.push([this.reference.getAllResourceOfType('GMShader'), CompletionItemKind.Event]);
        otherResources.push([this.reference.getAllResourceOfType('GMFont'), CompletionItemKind.TypeParameter]);
        otherResources.push([this.reference.getAllResourceOfType('GMTimeline'), CompletionItemKind.Keyword]);
        otherResources.push([this.reference.getAllResourceOfType('GMRoom'), CompletionItemKind.Folder]);
        otherResources.push([this.reference.getAllResourceOfType('GMExtension'), CompletionItemKind.Operator]);

        // Other Resource Double Loop
        for (const thisResourceType of otherResources) {
            for (const thisItem of thisResourceType[0]) {
                if (rx.test(thisItem) === true) {
                    workingArray.push({
                        label: thisItem,
                        kind: thisResourceType[1],
                        textEdit: {
                            newText: thisItem.replace(thisWord, ''),
                            range: thisRange
                        }
                    });
                }
            }
        }
        // send it off:
        this.editCompletionList(workingArray, true);
    }

    private async periodCompletion(params: CompletionParams) {
        let thisWord = await getWordAtPositionFS(params.textDocument.uri, params.position, this.fs);
        if (!thisWord) return;
        let workingArray: CompletionItem[] = [];

        const ourWords = thisWord.split('.');
        const getAll = ourWords[1] == undefined;
        const rx = new RegExp('^' + ourWords[1]);

        // Idiotic Macros
        if (this.reference.macroExists(ourWords[0])) {
            const macroVal = this.reference.macroGetMacroValue(ourWords[0]);
            if (macroVal) ourWords[0] = macroVal;
        }

        // Variables
        const variableList = this.reference.objectGetAllInsts(ourWords[0]);
        for (const thisVar of variableList) {
            if (rx.test(thisVar) || getAll) {
                workingArray.push({
                    label: thisVar,
                    kind: CompletionItemKind.Variable,
                    textEdit: {
                        newText: thisVar,
                        range: Range.create(params.position, params.position)
                    }
                });
            }
        }

        // Enums
        const enumMembers = this.reference.enumGetMemberNames(ourWords[0]);
        if (enumMembers) {
            for (const enumMember of enumMembers) {
                if (rx.test(enumMember) || getAll) {
                    workingArray.push({
                        label: enumMember,
                        kind: CompletionItemKind.EnumMember,
                        textEdit: {
                            newText: enumMember,
                            range: Range.create(params.position, params.position)
                        }
                    });
                }
            }
        }

        this.editCompletionList(workingArray, false);
    }

    private editCompletionList(items: CompletionItem[], isIncomplete: boolean) {
        this.completionList.items = items;
        this.completionList.isIncomplete = isIncomplete;
    }

    public onCompletionResolveRequest(params: CompletionItem): CompletionItem {
        switch (params.kind) {
            case CompletionItemKind.Function:
                return this.resolveFunction(params);
            case CompletionItemKind.Constant:
                return this.resolveMacro(params);

            default:
                return params;
        }
    }

    private resolveFunction(thisItem: CompletionItem): CompletionItem {
        // Script
        const scriptPack = this.reference.scriptGetPackage(thisItem.label);
        if (scriptPack) return this.resolveFunctionJSDOC(thisItem, scriptPack.JSDOC);

        // Functions
        const funcPack = this.reference.functionGetPackage(thisItem.label);
        if (funcPack) return this.resolveFunctionJSDOC(thisItem, funcPack.JSDOC);

        const extPack = this.reference.extensionGetPackage(thisItem.label);
        if (extPack) return this.resolveFunctionJSDOC(thisItem, extPack.JSDOC);

        return thisItem;
    }

    private resolveFunctionJSDOC(thisItem: CompletionItem, jsdoc: JSDOC) {
        let documentation: MarkupContent = { kind: MarkupKind.Markdown, value: '' };

        // Details
        let type = jsdoc.isScript ? '(script)' : '(function)';

        // Documentation
        let parameterContent: Array<string> = [];
        for (const thisParam of jsdoc.parameters) {
            let ourParam = '*@param* ```' + thisParam.label + '```';
            ourParam += thisParam.documentation == '' ? '' : ' — ' + thisParam.documentation;
            parameterContent.push(ourParam);
        }

        documentation.value += parameterContent.join('\n\n');

        // Return Value:
        documentation.value += jsdoc.returns == '' ? '' : '\n\n' + '*@returns* ' + jsdoc.returns;

        // Documentation
        documentation.value += jsdoc.description == '' ? '' : '\n\n' + jsdoc.description.split('.', 1).join('.') + '.';

        thisItem.detail = type + ' ' + jsdoc.signature;
        thisItem.documentation = documentation;

        return thisItem;
    }

    private resolveMacro(thisItem: CompletionItem) {
        const thisMacroVal = this.reference.macroGetMacroValue(thisItem.label);
        if (thisMacroVal) {
            thisItem.detail = '(macro) ' + thisItem.label + ' == ' + thisMacroVal;
        }
        return thisItem;
    }
}
