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
			const foundObject = await this.objectVariableLocation(ourWord);
			if (foundObject) {
				return foundObject;
			}

			// Enum Members
			if (this.reference.enumExists(ourWord[ws.objName])) {
				return this.reference.getEnumLocation(ourWord[ws.objName]);
			}
		}

		// Objects
		if (this.reference.objectExists(thisWord)) {
		}

		// Scripts
		if (this.reference.scriptExists(thisWord)) {
			const scriptPack = this.reference.scriptGetScriptPackage(thisWord);
			if (scriptPack.JSDOC.isScript && scriptPack.uri) {
				return Location.create(scriptPack.uri.toString(), Range.create(0, 0, 0, 0));
			}
		}

		// Enums
		if (this.reference.enumExists(thisWord)) {
			return this.reference.getEnumLocation(thisWord);
		}

		// Macros
		if (this.reference.macroExists(thisWord)) {
			const macroEntry = this.reference.macroGetMacroInformation(thisWord);
			if (macroEntry) return macroEntry.location;
		}

		// Local Variables
		if (this.reference.localExists(params.textDocument.uri, thisWord)) {
			return this.reference.localGetDeclaration(params.textDocument.uri, thisWord);
		}

		// Last Ditch -- are we a variable of this object itself?
		const fs: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
		const docInfo = await fs.getDocumentFolder(params.textDocument.uri);
		if (docInfo) {
			const ourObject = [docInfo.name, thisWord];
			const foundVar = await this.objectVariableLocation(ourObject);

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

			const locations = await this.objectVariableAllLocations(ourWord[ws.objName], ourWord[ws.varName]);
			if (locations) return locations;
		}

		// // Objects
		// if (this.reference.objectExists(thisWord)) {
		// }

		// // Scripts
		// if (this.reference.scriptExists(thisWord)) {
		// 	const scriptPack = this.reference.scriptGetScriptPackage(thisWord);
		// 	if (scriptPack.JSDOC.isScript && scriptPack.uri) {
		// 		return Location.create(scriptPack.uri.toString(), Range.create(0, 0, 0, 0));
		// 	}
		// }

		// // Enums
		// if (this.reference.enumExists(thisWord)) {
		// 	return this.reference.getEnumLocation(thisWord);
		// }

		// // Macros
		// if (this.reference.macroExists(thisWord)) {
		// 	const macroEntry = this.reference.macroGetMacroInformation(thisWord);
		// 	if (macroEntry) return macroEntry.location;
		// }

		// Local Variables
		if (this.reference.localExists(params.textDocument.uri, thisWord)) {
			return this.reference.localGetAllReferences(params.textDocument.uri, thisWord);
		}

		// Last Ditch -- are we a variable of this object itself?
		const fs: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
		const docInfo = await fs.getDocumentFolder(params.textDocument.uri);
		if (docInfo) {
            const locations = await this.objectVariableAllLocations(docInfo.name, thisWord);
			if (locations) return locations;
		}

		return null;
	}

	private async objectVariableLocation(ourWord: string[]): Promise<undefined | Location> {
		if (this.reference.objectExists(ourWord[ws.objName])) {
			const varPack = this.reference.getObjectVariablePackage(ourWord[ws.objName], ourWord[ws.varName]);

			if (varPack) {
				return varPack.referenceLocations[varPack.origin.arrayIndex];
			}
		}
		return undefined;
	}

	private async objectVariableAllLocations(objName: string, varName: string) {
		// Objects
		if (this.reference.objectExists(objName)) {
			const varPack = this.reference.getObjectVariablePackage(objName, varName);

			if (varPack) {
				return varPack.referenceLocations;
			}
		}

		return null;
	}
}
