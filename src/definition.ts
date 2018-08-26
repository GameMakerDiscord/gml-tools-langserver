import { Reference } from "./reference";
import { Location, TextDocumentPositionParams, Range } from "vscode-languageserver/lib/main";
import { getWordAtPositionFS } from "./utils";
import { ws } from "./hover";
import { LangServ } from "./langserv";
import { FileSystem } from "./fileSystem";
import { LanguageService } from "./declarations";

export class GMLDefinitionProvider {
    private reference: Reference;

    constructor(reference: Reference, private lsp: LangServ) {
        this.reference = reference;
        this.lsp = lsp;
    }

    public async onDefinitionRequest(params: TextDocumentPositionParams): Promise<Location | Location[] | null> {
        const thisWord = await getWordAtPositionFS(
            params.textDocument.uri,
            params.position,
            this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem)
        );
        if (!thisWord) {
            return null;
        }

        // All "." Words
        if (thisWord.includes(".")) {
            const ourWord = thisWord.split(".");

            // Objects
            const foundObject = await this.objectVariableLocation(ourWord);
            if (foundObject) {
                return foundObject;
            }

            // Enum Members
            if (this.reference.enumExists(ourWord[ws.beforePeriod])) {
                return this.reference.getEnumLocation(ourWord[ws.beforePeriod]);
            }
        }

        // Objects
        if (this.reference.objectExists(thisWord)) {
        }

        // Scripts
        if (this.reference.scriptExists(thisWord)) {
            const scriptPack = this.reference.scriptGetScriptPackage(thisWord);
            if (scriptPack.JSDOC.isScript) {
                return Location.create(scriptPack.uri.toString(), Range.create(0, 0, 0, 0));
            }
        }

        // Enums
        if (this.reference.enumExists(thisWord)) {
            return this.reference.getEnumLocation(thisWord);
        }

        // Macros
        if (this.reference.macroExists(thisWord)) {
            return this.reference.getMacroLocation(thisWord);
        }

        // Local Variables
        if (this.reference.localExists(params.textDocument.uri, thisWord)) {
            return this.reference.localGetLocation(params.textDocument.uri, thisWord);
        }


        // Last Ditch -- are we a variable of this object itself?
        const fs: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
        const ourObject = [(await fs.getDocumentFolder(params.textDocument.uri)).name, thisWord];
        const foundVar = await this.objectVariableLocation(ourObject);

        if (foundVar) {
            return foundVar;
        }

        return null;
    }

    private async objectVariableLocation(ourWord: string[]): Promise<undefined | Location> {
        if (this.reference.objectExists(ourWord[ws.beforePeriod])) {
            const varPack = this.reference.getObjectVariablePackage(ourWord[ws.beforePeriod], ourWord[ws.afterPeriod]);

            if (varPack) {
                return Location.create(varPack.uri, varPack.range);
            }
        }
        return undefined;
    }
}
