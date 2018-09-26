import { Reference } from "./reference";
import { Location, TextDocumentPositionParams, Range, ReferenceParams } from "vscode-languageserver/lib/main";
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
			const foundObject = await this.reference.objectGetOriginLocation(ourWord[ws.objName], ourWord[ws.varName]);
			if (foundObject) {
				return foundObject;
			}

			// Enum Members
			if (this.reference.enumExists(ourWord[ws.objName])) {
				return this.reference.enumGetEnumLocation(ourWord[ws.objName]);
			}

			return null;
		}

		// Objects
		if (this.reference.objectExists(thisWord)) {
		}

		// Scripts
		const scriptPack = this.reference.scriptGetScriptPackage(thisWord);
		if (scriptPack && scriptPack.JSDOC.isScript && scriptPack.uri) {
			return Location.create(scriptPack.uri.toString(), Range.create(0, 0, 0, 0));
		}

		// Enums
		if (this.reference.enumExists(thisWord)) {
			return this.reference.enumGetEnumLocation(thisWord);
		}

		// Macros
		const macroOrigin = this.reference.macroGetOrigin(thisWord);
		if (macroOrigin) return macroOrigin;

		// Local Variables
		if (this.reference.localExists(params.textDocument.uri, thisWord)) {
			return this.reference.localGetDeclaration(params.textDocument.uri, thisWord);
		}

		// Last Ditch -- are we a variable of this object itself?
		const fs: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
		const docInfo = await fs.getDocumentFolder(params.textDocument.uri);
		if (docInfo) {
			const foundVar = await this.reference.objectGetOriginLocation(docInfo.name, thisWord);

			if (foundVar) {
				return foundVar;
			}
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
		if (thisWord.includes(".")) {
			const ourWord = thisWord.split(".");
			if (ourWord.length !== 2) return null;

			const locations = await this.reference.objectGetAllVariableReferences(
				ourWord[ws.objName],
				ourWord[ws.varName]
			);
			if (locations) return locations;
		}

		// // Objects
		// if (this.reference.objectExists(thisWord)) {
		// }

		// Scripts
		const theseScriptReferences = this.reference.scriptGetAllReferences(thisWord);
		if (theseScriptReferences) return theseScriptReferences;

		// // Enums
		// if (this.reference.enumExists(thisWord)) {
		// 	return this.reference.getEnumLocation(thisWord);
		// }

		// Macros
		const theseMacroReferences = this.reference.macroGetAllReferences(thisWord);
		if (theseMacroReferences) return theseMacroReferences;

		// Local Variables
		if (this.reference.localExists(params.textDocument.uri, thisWord)) {
			return this.reference.localGetAllReferences(params.textDocument.uri, thisWord);
		}

		// Last Ditch -- are we a variable of this object itself?
		const fs: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
		const docInfo = await fs.getDocumentFolder(params.textDocument.uri);
		if (docInfo) {
			const locations = await this.reference.objectGetAllVariableReferences(docInfo.name, thisWord);
			if (locations) return locations;
		}

		return null;
	}
}
