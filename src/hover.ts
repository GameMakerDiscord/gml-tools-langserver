import { TextDocumentPositionParams, Hover, MarkedString } from "vscode-languageserver/lib/main";
import { getWordAtPositionFS } from "./utils";
import { JSDOC, FileSystem } from "./fileSystem";
import { Reference } from "./reference";



export enum ws {
    beforePeriod,
    afterPeriod
}

export class GMLHoverProvider {
    constructor(private reference: Reference, private fs: FileSystem) {
        this.reference = reference;
        this.fs        = fs;
    }
    public async provideHover(params: TextDocumentPositionParams): Promise<Hover> {
        // Retrieve our textDocument (TODO make our TextDocument Manager (guuuh));
        const hoveredText = await getWordAtPositionFS(params.textDocument.uri, params.position, this.fs);
        
        if (hoveredText) {
            // Do all our period hovers here:
            if (hoveredText.includes(".")) {
                const wordAtSplit = hoveredText.split(".");

                // Enums
                if (this.reference.enumExists(wordAtSplit[ws.beforePeriod])) {
                    const theseEnumMembers = this.reference.getEnumEntries(wordAtSplit[ws.beforePeriod]);

                    // Find our Enum's value:
                    let enumeration = 0;

                    for (const thisMember of theseEnumMembers) {
                        if (thisMember.enumName == wordAtSplit[ws.afterPeriod]) {
                            enumeration = thisMember.enumeration;
                            break;
                        }  
                    }

                    let returnMarkup: MarkedString = {
                        language: "gml",
                        value: "(enum member) " + wordAtSplit[ws.beforePeriod]
                                + '.' + wordAtSplit[ws.afterPeriod] + " = " + enumeration.toString()
                    }

                    // Find our Full Range:

                    return {
                        contents: returnMarkup
                    }
                }
            }

            // Check if it's a Function or Script:
            if (this.reference.scriptExists(hoveredText)) {
                return this.onHoverFunction(this.reference.scriptGetScriptPackage(hoveredText).JSDOC);
            }

            // Check if it's an Enum:
            if (this.reference.enumExists(hoveredText)) {
                let mrkString: MarkedString = {
                    value: "(enum) " + hoveredText,
                    language: "gml"
                }
                return {
                    contents: mrkString
                }
            }

            // Check if it's a Macro:
            if (this.reference.macroExists(hoveredText)) {
                const thisMac = this.reference.getMacroValue(hoveredText);
                let mrkString: MarkedString = {
                    value: "(macro) " + hoveredText + " = " + thisMac,
                    language: "gml"
                }

                return {
                    contents: mrkString
                }
            }
        } 
        
        return { contents: [] };
    }

    private onHoverFunction(jsdoc: JSDOC): Hover {
        let rMarkup: MarkedString[] = [];
        let type = jsdoc.isScript ? "(script)" : "(function)";
        
        // Signature
        rMarkup.push( {
            value: type + " " + jsdoc.signature,
            language: "gml"
        });

        // Documentation
        let parameterContent: Array<string> = [];
        for (const thisParam of jsdoc.parameters) {
            let ourParam = "*@param* ```" + thisParam.label + "```";
            ourParam+= thisParam.documentation == "" ? "" : " — " + thisParam.documentation;
            parameterContent.push(ourParam);
        }

        rMarkup.push(parameterContent.join("\n\n"));

        // Return Value:
        rMarkup.push(jsdoc.returns == "" ? "" : "\n\n" + "*@returns* " + jsdoc.returns);

        // Documentation
        rMarkup.push(jsdoc.description == "" ? "" : "\n\n" + jsdoc.description.split(".", 1).join(".") + ".");
        

        return { contents: rMarkup };
    }

    // private onHoverDeclaration(sourceText: string): Hover {
    //     const entry = this.fsManager.declarations[sourceText];
    //     // let rMarkup: MarkedString = {
    //     //     value: entry,
    //     //     language: "typescript"
    //     // }

    //     return { contents: entry};
    // }
}

