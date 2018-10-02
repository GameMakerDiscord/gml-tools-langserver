import { TextDocumentPositionParams, Hover, MarkedString } from 'vscode-languageserver/lib/main';
import { getWordAtPositionFS } from './utils';
import { JSDOC, FileSystem } from './fileSystem';
import { Reference } from './reference';

export enum ws {
    objName,
    varName
}

export class GMLHoverProvider {
    public numberOfSentences: number;

    constructor(private reference: Reference, private fs: FileSystem) {
        this.reference = reference;
        this.fs = fs;
        // We set number of sentences to 1, which mirrors the default user setting.
        this.numberOfSentences = 1;
    }
    public async provideHover(params: TextDocumentPositionParams): Promise<Hover> {
        // Retrieve our textDocument (TODO make our TextDocument Manager (guuuh));
        const thisHoveredText = await getWordAtPositionFS(params.textDocument.uri, params.position, this.fs);

        if (thisHoveredText) {
            // Do all our period hovers here:
            if (thisHoveredText.includes('.')) {
                const theseWords = thisHoveredText.split('.');

                // EnumMembers
                const enumEnumeration = this.reference.enumMemberGetEnumeration(
                    theseWords[ws.objName],
                    theseWords[ws.varName]
                );
                if (enumEnumeration) {
                    return {
                        contents: {
                            language: 'gml',
                            value:
                                '(enum member) ' +
                                theseWords[ws.objName] +
                                '.' +
                                theseWords[ws.varName] +
                                ' == ' +
                                enumEnumeration
                        }
                    };
                }
            }

            // Check if it's a Function or Script:
            const scriptPack = this.reference.scriptGetScriptPackage(thisHoveredText);
            if (scriptPack) return this.onHoverFunction(scriptPack.JSDOC);

            // Check if it's an Enum:
            if (this.reference.enumExists(thisHoveredText)) {
                let mrkString: MarkedString = {
                    value: '(enum) ' + thisHoveredText,
                    language: 'gml'
                };
                return {
                    contents: mrkString
                };
            }

            // Check if it's a Macro:
            const thisMacroEntry = this.reference.macroGetMacroValue(thisHoveredText);
            if (thisMacroEntry) {
                let mrkString: MarkedString = {
                    value: '(macro) ' + thisHoveredText + ' == ' + thisMacroEntry,
                    language: 'gml'
                };

                return {
                    contents: mrkString
                };
            }
        }

        return { contents: [] };
    }

    private onHoverFunction(jsdoc: JSDOC): Hover {
        let rMarkup: MarkedString[] = [];
        let type = jsdoc.isScript ? '(script)' : '(function)';

        // Signature
        rMarkup.push({
            value: type + ' ' + jsdoc.signature,
            language: 'gml'
        });

        // Documentation
        let parameterContent: Array<string> = [];
        for (const thisParam of jsdoc.parameters) {
            let ourParam = '*@param* ```' + thisParam.label + '```';
            ourParam += thisParam.documentation == '' ? '' : ' — ' + thisParam.documentation;
            parameterContent.push(ourParam);
        }

        rMarkup.push(parameterContent.join('\n\n'));

        // Return Value:
        rMarkup.push(jsdoc.returns == '' ? '' : '\n\n' + '*@returns* ' + jsdoc.returns);

        // Documentation
        if (jsdoc.description) {
            let desc = '\n\n' + jsdoc.description;
            if (this.numberOfSentences != -1) {
                desc = desc.split('.', this.numberOfSentences).join('.');
            }

            desc += jsdoc.link === undefined ? '' : ' ' + '[Documentation.](' + jsdoc.link + ')';
            rMarkup.push(desc);
        }

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
