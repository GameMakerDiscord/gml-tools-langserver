import { Reference } from './reference';
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
import { OtherResources } from './declarations';

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
        const thisRange = Range.create(params.position, params.position);

        let workingArray: CompletionItem[] = [];
        const rx = new RegExp('^' + thisWord);

        // Find our Implicit
        const thisImplicitName = await this.reference.implicitGetCurrentImplicitEntry(
            params.textDocument.uri,
            params.position
        );

        // Iterate on the Instance Variables:
        if (thisImplicitName) {
            const variableList = this.reference.instGetAllInsts(thisImplicitName);

            // Send our Insts out:
            for (const thisVar of variableList) {
                if (thisVar.match(rx) !== null) {
                    const orig = this.reference.instGetOriginLocation(thisImplicitName, thisVar);
                    if (
                        orig &&
                        (orig.range.start.line !== thisRange.start.line &&
                            orig.range.start.character !== thisRange.start.character)
                    ) {
                        workingArray.push({
                            label: thisVar,
                            kind: CompletionItemKind.Variable,
                            textEdit: {
                                newText: thisVar.replace(thisWord, ''),
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
            for (const thisVar of locals) {
                if (thisVar.match(rx) !== null) {
                    const orig = this.reference.localGetOrigin(params.textDocument.uri, thisVar);
                    if (
                        orig &&
                        (orig.range.start.line !== thisRange.start.line &&
                            orig.range.start.character !== thisRange.start.character)
                    ) {
                        workingArray.push({
                            label: thisVar,
                            kind: CompletionItemKind.Field,
                            textEdit: {
                                newText: thisVar.replace(thisWord, ''),
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
            if (item && item.match(rx) !== null) {
                const total = workingArray.push({
                    label: item,
                    kind: CompletionItemKind.Function,
                    textEdit: {
                        newText: item.replace(thisWord, ''),
                        range: thisRange
                    }
                });

                if (total > 10) break;
            }
        }

        // Scripts
        const scriptList = this.reference.scriptGetAllScriptNames();
        for (const item of scriptList) {
            if (item && item.match(rx) !== null) {
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

        // Extensions
        const extensionList = this.reference.extensionGetAllExtensionNames();
        for (const item of extensionList) {
            if (item && item.match(rx) !== null) {
                const total = workingArray.push({
                    label: item,
                    kind: CompletionItemKind.Function,
                    textEdit: {
                        newText: item.replace(thisWord, ''),
                        range: thisRange
                    }
                });

                if (total > 10) break;
            }
        }

        // Objects
        const objectList = this.reference.objectGetList();
        for (const obj of objectList) {
            if (obj.match(rx) !== null) {
                workingArray.push({
                    label: obj,
                    kind: CompletionItemKind.Class,
                    textEdit: {
                        newText: obj.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // The Global Object
        if ('global'.match(rx) !== null) {
            workingArray.push({
                label: 'global',
                kind: CompletionItemKind.Class,
                textEdit: {
                    newText: 'global'.replace(thisWord, ''),
                    range: thisRange
                }
            });
        }

        // Enums:
        const enumList = this.reference.enumGetEnumList();
        for (const thisEnum of enumList) {
            if (thisEnum.match(rx) !== null) {
                workingArray.push({
                    label: thisEnum,
                    kind: CompletionItemKind.Enum,
                    textEdit: {
                        newText: thisEnum.replace(thisWord, ''),
                        range: thisRange
                    }
                });
            }
        }

        // Macros
        const macroList = this.reference.getMacroList();
        for (const item of macroList) {
            if (item.match(rx) !== null) {
                workingArray.push({
                    label: item,
                    kind: CompletionItemKind.Constant,
                    textEdit: {
                        newText: item.replace(thisWord, ''),
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
            for (const thisResource of thisResourceType[0]) {
                if (thisResource.match(rx) !== null) {
                    workingArray.push({
                        label: thisResource,
                        kind: thisResourceType[1],
                        textEdit: {
                            newText: thisResource.replace(thisWord, ''),
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

        // Idiotic Macros
        if (this.reference.macroExists(thisWord)) {
            const macroVal = this.reference.macroGetMacroValue(thisWord);
            if (macroVal) thisWord = macroVal;
        }

        // Variables
        const variableList = this.reference.instGetAllInsts(thisWord);
        for (const thisVar of variableList) {
            workingArray.push({
                label: thisVar,
                kind: CompletionItemKind.Variable,
                textEdit: {
                    newText: thisVar,
                    range: Range.create(params.position, params.position)
                }
            });
        }

        // Enums
        const enumMembers = this.reference.enumGetMemberNames(thisWord);
        if (enumMembers) {
            // Iterate on the Enums
            for (const enumMember of enumMembers) {
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

    private resolveFunction(thisItem: CompletionItem) {
        const scriptPack = this.reference.scriptGetPackage(thisItem.label);
        if (!scriptPack) return thisItem;
        const jsdoc = scriptPack.JSDOC;
        if (!jsdoc) return thisItem;

        let documentation: MarkupContent = {
            kind: MarkupKind.Markdown,
            value: ''
        };

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
