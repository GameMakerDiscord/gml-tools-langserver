import { Reference } from './Reference/reference';
import { Location, TextDocumentPositionParams, Range, ReferenceParams } from 'vscode-languageserver/lib/main';
import { getWordAtPositionFS } from './utils';
import { ws } from './hover';
import { LangServ } from './langserv';
import { FileSystem } from './fileSystem';
import { LanguageService } from './declarations';
import URI from 'vscode-uri';

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
        if (thisWord.includes('.')) {
            const ourWord = thisWord.split('.');

            // Objects
            const objLocation = await this.reference.instGetOriginLocation(ourWord[ws.objName], ourWord[ws.varName]);
            if (objLocation) {
                return objLocation;
            }

            // Enum Members
            const enumMemberLocation = this.reference.enumMemberGetOriginLocation(
                ourWord[ws.objName],
                ourWord[ws.varName]
            );
            if (enumMemberLocation) {
                return enumMemberLocation;
            }

            return null;
        }

        // Objects
        if (this.reference.objectExists(thisWord)) {
        }

        // Scripts
        const scriptPack = this.reference.scriptGetPackage(thisWord);
        if (scriptPack && scriptPack.JSDOC && scriptPack.JSDOC.isScript && scriptPack.uri) {
            return Location.create(scriptPack.uri, Range.create(0, 0, 0, 0));
        }

        // Functions?
        const funcPack = this.reference.functionGetPackage(thisWord);
        if (funcPack && funcPack.JSDOC.link) {
            return Location.create(URI.parse(funcPack.JSDOC.link).toString(), Range.create(0, 0, 0, 0));
        }

        // Extensions
        const extPack = this.reference.extensionGetPackage(thisWord);
        if (extPack) {
            return extPack.originLocation;
        }

        // Enums
        const enumLocation = this.reference.enumGetOriginLocation(thisWord);
        if (enumLocation) {
            return enumLocation;
        }

        // Macros
        const macroOrigin = this.reference.macroGetOrigin(thisWord);
        if (macroOrigin) return macroOrigin;

        // Local Variables
        const localOrigin = this.reference.localGetOrigin(params.textDocument.uri, thisWord);
        if (localOrigin) return localOrigin;

        // Last Ditch -- are we a variable of this object itself?

        const fs: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
        const docInfo = await fs.getDocumentFolder(params.textDocument.uri);
        if (docInfo) {
            const foundVar = await this.reference.instGetOriginLocation(docInfo.name, thisWord);
            if (foundVar) return foundVar;
        }

        return null;
    }

    public async onShowAllReferencesRequest(params: ReferenceParams): Promise<Location[] | null> {
        const thisWord = await getWordAtPositionFS(
            params.textDocument.uri,
            params.position,
            this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem)
        );
        if (!thisWord) {
            return null;
        }

        // All "." Words
        if (thisWord.includes('.')) {
            const ourWord = thisWord.split('.');
            if (ourWord.length !== 2) return null;

            // The Ariak check
            const macroVal = this.reference.macroGetMacroValue(thisWord[ws.objName]);
            if (macroVal) ourWord[ws.objName] = macroVal;

            const locations = await this.reference.instGetAllVariableReferences(
                ourWord[ws.objName],
                ourWord[ws.varName]
            );
            if (locations) return locations;

            const enumMembers = this.reference.enumMemberGetAllReferences(ourWord[ws.objName], ourWord[ws.varName]);
            if (enumMembers) return enumMembers;
        }

        // // Objects
        // if (this.reference.objectExists(thisWord)) {
        // }

        // Scripts
        const theseScriptReferences = this.reference.scriptGetAllReferences(thisWord);
        if (theseScriptReferences) return theseScriptReferences;

        // Functions
        const theseFuncRefs = this.reference.functionGetAllReferences(thisWord);
        if (theseFuncRefs) return theseFuncRefs;

        // Extensions
        const theseExts = this.reference.extensionGetAllReferences(thisWord);
        if (theseExts) return theseExts;

        // Enums
        const enumReferences = this.reference.enumGetAllReferences(thisWord);
        if (enumReferences) return enumReferences;

        // Macros
        const theseMacroReferences = this.reference.macroGetAllReferences(thisWord);
        if (theseMacroReferences) return theseMacroReferences;

        // Local Variables
        const localReferences = this.reference.localGetAllReferences(params.textDocument.uri, thisWord);
        if (localReferences) return localReferences;

        // Last Ditch -- are we a variable of this object itself?
        const fs: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
        const docInfo = await fs.getDocumentFolder(params.textDocument.uri);
        if (docInfo) {
            const locations = await this.reference.instGetAllVariableReferences(docInfo.name, thisWord);
            if (locations) return locations;
        }

        return null;
    }
}
