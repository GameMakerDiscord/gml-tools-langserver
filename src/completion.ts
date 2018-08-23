import { Reference } from "./reference";
import { FileSystem } from "./fileSystem";
import { 
    CompletionItem, CompletionList, CompletionItemKind,
    CompletionParams, CompletionTriggerKind, Range,
    MarkupContent, MarkupKind
} from "vscode-languageserver"
import { getWordAtPositionFS } from "./utils";
import { ResourceType, OtherResources } from "./declarations";



export class GMLCompletionProvider {
    private completionList: CompletionList;

    constructor(private reference: Reference, private fs: FileSystem) {
        this.reference = reference;
        this.fs        = fs;

        this.completionList = {
            isIncomplete : true,
            items: []
        }
    }

    public async onCompletionRequest(params: CompletionParams) {
        this.completionList.items.length = 0;
        if (params.context) {
            switch (params.context.triggerKind) {
                case CompletionTriggerKind.Invoked:
                    await this.nonPeriodCompletion(params);
                    break;
                
                case CompletionTriggerKind.TriggerCharacter:
                    await this.periodCompletion(params)
                    break;

                case CompletionTriggerKind.TriggerForIncompleteCompletions:
                    await this.nonPeriodCompletion(params);
                    break;
            }
        }

        if ((params.context) && (params.context.triggerKind == CompletionTriggerKind.TriggerCharacter)) {
            this.periodCompletion(params);
        } else this.nonPeriodCompletion(params);

        return this.completionList;
    }

    private async nonPeriodCompletion(params: CompletionParams) {
        const thisWord = await getWordAtPositionFS(params.textDocument.uri, params.position, this.fs);
        const thisRange = Range.create(params.position, params.position);

        let workingArray: CompletionItem[] = [];
        const rx = new RegExp("^" + thisWord);

        // All our variables in this object:
        const docInformation = await this.fs.getDocumentFolder(params.textDocument.uri);

        // Iterate on the Instance Variables:
        if (docInformation.type == ResourceType.Object) {
            const variableList = this.reference.getAllObjectVariables(docInformation.name);

            for (const thisVar of variableList) {
                if (thisVar.match(rx) !== null) {
                    workingArray.push( {
                        label: thisVar,
                        kind: CompletionItemKind.Variable,
                        textEdit: {
                            newText : thisVar.replace(thisWord, ""),
                            range : thisRange
                        },
                    })
                }
            }
        }

        // Iterate on the Local Variables:
        const locals = this.reference.getAllLocalsAtURI(params.textDocument.uri);
        if (locals) {
            for (const thisVar of locals) {
                if (thisVar.value.match(rx) !== null) {
                    workingArray.push( {
                        label: thisVar.value,
                        kind: CompletionItemKind.Field,
                        textEdit: {
                            newText : thisVar.value.replace(thisWord, ""),
                            range : thisRange
                        },
                    })
                }
            }
        }


        // Functions/Scripts
        const functionList = this.reference.scriptGetScriptList();
        for (const item of functionList) {
            if (item.match(rx) !== null) {
                

                const total = workingArray.push({
                    label : item,
                    kind: CompletionItemKind.Function,
                    textEdit: {
                        newText : item.replace(thisWord, ""),
                        range : thisRange
                    }
                });
                
                if (total > 16) {
                    break;
                }
            }
        }

        // Objects
        const objectList = this.reference.objectGetList();
        for (const obj of objectList) {
            if (obj.match(rx) !== null) {
                workingArray.push({
                    label : obj,
                    kind: CompletionItemKind.Class,
                    textEdit: {
                        newText : obj.replace(thisWord, ""),
                        range : thisRange
                    }
                });
            }
        }

        // Enums:
        const enumList = this.reference.getEnumList();
        for (const thisEnum of enumList) {
            if (thisEnum.match(rx) !== null) {
                workingArray.push({
                    label: thisEnum,
                    kind: CompletionItemKind.Enum,
                    textEdit: {
                        newText : thisEnum.replace(thisWord, ""),
                        range : thisRange
                    }
                })
            }
        }

        // Macros
        const macroList = this.reference.getMacroList();
        for (const item of macroList) {
            if (item.match(rx) !== null) {
                workingArray.push({
                    label : item,
                    kind: CompletionItemKind.Constant,
                    textEdit: {
                        newText : item.replace(thisWord, ""),
                        range : thisRange
                    }
                });
            }
        }

        // Sprites
        for (const thisSprite of this.reference.spriteGetAllSprites()) {
            if (thisSprite.match(rx) !== null) {
                workingArray.push({
                    label: thisSprite,
                    kind: CompletionItemKind.Color,
                    textEdit: {
                        newText : thisSprite.replace(thisWord, ""),
                        range : thisRange
                    }
                })
            }
        }
        
        // All other resources:
        let otherResources: OtherResources[] = [];
        otherResources.push([this.reference.tilesets, CompletionItemKind.Struct]);
        otherResources.push([this.reference.sounds, CompletionItemKind.Interface]);
        otherResources.push([this.reference.paths, CompletionItemKind.Unit]);
        otherResources.push([this.reference.shaders, CompletionItemKind.Event]); 
        otherResources.push([this.reference.fonts, CompletionItemKind.TypeParameter]);
        otherResources.push([this.reference.timeline, CompletionItemKind.Keyword]);
        otherResources.push([this.reference.rooms, CompletionItemKind.Folder]);
        otherResources.push([this.reference.extensions, CompletionItemKind.Operator]);

        // Other Resource Double Loop
        for (const thisResourceType of otherResources) {
            for (const thisResource of thisResourceType[0]) {
                if (thisResource.match(rx) !== null) {
                    workingArray.push({
                        label: thisResource,
                        kind: thisResourceType[1],
                        textEdit: {
                            newText : thisResource.replace(thisWord, ""),
                            range : thisRange
                        } 
                    })
                }
            }
        }
        // send it off:
        this.editCompletionList(workingArray, true);
    }

    private async periodCompletion(params: CompletionParams) {
        let thisWord = await getWordAtPositionFS(params.textDocument.uri, params.position, this.fs);
        let workingArray: CompletionItem[] = [];

        const variableList = this.reference.getAllObjectVariables(thisWord);


        // Variables
        for (const thisVar of variableList) {
            workingArray.push( {
                label: thisVar,
                kind: CompletionItemKind.Variable,
                textEdit: {
                    newText : thisVar,
                    range : Range.create(params.position, params.position)
                }
            })
        }

        // Global Variables
        if (thisWord == "global") {
            const globalList = this.reference.getGlobalVariables();
            for (const thisGlob of globalList) {
                workingArray.push( {
                    label: thisGlob,
                    kind: CompletionItemKind.Interface,
                    textEdit: {
                        newText : thisGlob,
                        range : Range.create(params.position, params.position)
                    }
                })
            }
        }

        // Enums
        if (this.reference.enumExists(thisWord)) {
            const enumList = this.reference.getEnumEntries(thisWord);
            // Iterate on the Enums
            for (const enumMember of enumList) {
                workingArray.push( {
                    label: enumMember.enumName,
                    kind: CompletionItemKind.EnumMember,
                    textEdit: {
                        newText : enumMember.enumName,
                        range : Range.create(params.position, params.position)
                    }
                })
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
        if (this.reference.scriptExists(thisItem.label)) {
            const jsdoc = this.reference.scriptGetScriptPackage(thisItem.label).JSDOC;
            let documentation: MarkupContent = {
                kind: MarkupKind.Markdown,
                value: ""
            }

            // Details
            let type = jsdoc.isScript ? "(script)" : "(function)";
        
            // Documentation
            let parameterContent: Array<string> = [];
            for (const thisParam of jsdoc.parameters) {
                let ourParam = "*@param* ```" + thisParam.label + "```";
                ourParam+= thisParam.documentation == "" ? "" : " — " + thisParam.documentation;
                parameterContent.push(ourParam);
            }

            documentation.value+= (parameterContent.join("\n\n"));

            // Return Value:
            documentation.value+= jsdoc.returns == "" ? "" : "\n\n" + "*@returns* " + jsdoc.returns;

            // Documentation
            documentation.value+= jsdoc.description == "" ? "" : "\n\n" + jsdoc.description.split(".", 1).join(".") + ".";

            thisItem.detail = type + " " + jsdoc.signature;
            thisItem.documentation = documentation;
        }

        return thisItem;
    }

    private resolveMacro(thisItem: CompletionItem) {
        if (this.reference.macroExists(thisItem.label)) {
            const thisMacro = this.reference.getMacroValue(thisItem.label);
            thisItem.detail = "(macro) " + thisItem.label + " == " + thisMacro;
        }
        return thisItem;
    }
}