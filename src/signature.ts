import { Reference } from "./reference";
import { TextDocumentPositionParams, SignatureHelp, ParameterInformation } from "vscode-languageserver/lib/main";
import { getIndexFromPosition, getWordAtIndex, normalizeEoLSequences } from "./utils";
import { FileSystem } from "./fileSystem";
import { Token, SignatureWalkState, TokenNames } from "./declarations";

export class GMLSignatureProvider {
	private reference: Reference;
	private fs: FileSystem;

	constructor(ref: Reference, fs: FileSystem) {
		this.reference = ref;
		this.fs = fs;
	}

	public async onSignatureRequest(params: TextDocumentPositionParams): Promise<SignatureHelp | null> {
		const uri = params.textDocument.uri;
		const tokenList = await (await this.fs.getDiagnosticHandler(uri)).getTokenList();
		const thisPos = getIndexFromPosition(await this.fs.getDocument(uri), params.position);

		//Early exit for very first word!
		if (tokenList.length == 0) return null;

		// Walk down our TokenList As Far as we can
		let thisIndex = tokenList.length - 1;
		for (let index = thisIndex; index != 0; index--) {
			const element = tokenList[index];
			thisIndex = index;

			if (element.startIdx < thisPos) {
				break;
			}
		}

		// Walk the entire token list
		let ourCommas = 0;
		let functionDepth = 0;
		let state: SignatureWalkState = SignatureWalkState.FINAL_OPEN;
		let ourFunc: Token = null;

		// Iterate backwards:
		for (let i = thisIndex; i > -1; i--) {
			const element = tokenList[i];
			let breakMain = false;

			switch (state) {
				case SignatureWalkState.FINAL_OPEN:
					switch (element.tokenName) {
						case TokenNames.comma:
							ourCommas++;
							break;
						case TokenNames.cParens:
							functionDepth--;
							state = SignatureWalkState.INTERMEDIARY_OPEN;
							break;
						case TokenNames.oParens:
							state = SignatureWalkState.FINAL_FUNC;
							break;
					}
					break;

				case SignatureWalkState.FINAL_FUNC:
					if (element.tokenName == TokenNames.funcIdentifier) {
						ourFunc = element;
					}
					breakMain = true;
					break;

				case SignatureWalkState.INTERMEDIARY_OPEN:
					switch (element.tokenName) {
						case TokenNames.comma:
						case TokenNames.funcIdentifier:
							break;

						case TokenNames.cParens:
							functionDepth--;
							state = SignatureWalkState.INTERMEDIARY_OPEN;
							break;
						case TokenNames.oParens:
							functionDepth++;
							state =
								functionDepth >= 0
									? SignatureWalkState.FINAL_OPEN
									: SignatureWalkState.INTERMEDIARY_OPEN;
							break;
					}
					break;
			}

			if (breakMain) {
				break;
			}
		}

		if (ourFunc) {
			// Find our word
			const textDocument = normalizeEoLSequences(await this.fs.getDocument(uri));
			const thisWord = await getWordAtIndex(textDocument, ourFunc.startIdx);

			// Get
			if (this.reference.scriptExists(thisWord) == false) {
				return {
					signatures: [],
					activeParameter: null,
					activeSignature: null
				};
			}
			const referencePackage = this.reference.scriptGetScriptPackage(thisWord).JSDOC;
			let paras: ParameterInformation[] = [];
			referencePackage.parameters.forEach((param) => {
				paras.push(
					ParameterInformation.create(
						param.label,
						param.documentation.slice(0, param.documentation.indexOf("."))
					)
				);
			});

			const docs = referencePackage.description.indexOf(".")
				? referencePackage.description.slice(0, referencePackage.description.indexOf(".") + 1)
				: referencePackage.description.slice(0, 30) + "...";
			return {
				signatures: [
					{
						label: referencePackage.signature,
						documentation: docs,
						parameters: paras
					}
				],
				activeParameter: ourCommas,
				activeSignature: 0
			};
		}
		return null;
	}
}
