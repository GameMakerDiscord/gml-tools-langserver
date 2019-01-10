import { Reference } from './Reference/reference';
import { TextDocumentPositionParams, SignatureHelp, ParameterInformation } from 'vscode-languageserver/lib/main';
import { getIndexFromPosition, getWordAtIndex, normalizeEoLSequences } from './utils';
import { Token, SignatureWalkState, TokenNames, JSDOC } from './declarations';
import { FileSystem } from './fileSystem';

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
        const thisDocFolder = await this.fs.getDocumentFolder(uri);
        if (!thisDocFolder) return null;
        const thisDoc = thisDocFolder.fileFullText;
        const thisPos = getIndexFromPosition(thisDoc, params.position);

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
        let ourFunc: Token | undefined;

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

        // If we found no function, exit
        if (!ourFunc) return null;

        // Find our word
        const textDocument = normalizeEoLSequences(thisDoc);
        const thisWord = await getWordAtIndex(textDocument, ourFunc.startIdx);
        if (!thisWord) return null;

        // Scripts
        const scriptPack = this.reference.scriptGetPackage(thisWord);
        if (scriptPack) return this.signaturePrepareJSDOC(scriptPack.JSDOC, ourCommas);

        // Functions
        const funcPack = this.reference.functionGetPackage(thisWord);
        if (funcPack) return this.signaturePrepareJSDOC(funcPack.JSDOC, ourCommas);

        // Extensions
        const extPack = this.reference.extensionGetPackage(thisWord);
        if (extPack) return this.signaturePrepareJSDOC(extPack.JSDOC, ourCommas);

        return {
            signatures: [],
            activeParameter: null,
            activeSignature: null
        };
    }

    private signaturePrepareJSDOC(thisJSDOC: JSDOC, activteParameter: number): SignatureHelp {
        const ourParameters: ParameterInformation[] = [];

        for (const thisParameter of thisJSDOC.parameters) {
            const thisPeriod = thisParameter.documentation.indexOf('.');
            let thisDoc =
                thisPeriod === -1 ? thisParameter.documentation : thisParameter.documentation.slice(0, thisPeriod + 1);
            ourParameters.push(ParameterInformation.create(thisParameter.label, thisDoc));
        }

        const thisPeriod = thisJSDOC.description.indexOf(".");
        const ourDoc = thisPeriod === -1 ? thisJSDOC.description : thisJSDOC.description.slice(0, thisPeriod);

        // Create a signature if we don't have one (non-functions):
        let ourSignature = thisJSDOC.signature;

        if (ourSignature.includes('(') == false) {
            ourSignature += '(';
            for (let i = 0; i < ourParameters.length; i++) {
                const thisParam = ourParameters[i];
                if (i == 0) {
                    ourSignature += thisParam.label;
                } else {
                    ourSignature += ', ' + thisParam.label;
                }
            }
            ourSignature += ')';
        }

        return {
            signatures: [
                {
                    label: ourSignature,
                    documentation: ourDoc,
                    parameters: ourParameters
                }
            ],
            activeParameter: activteParameter,
            activeSignature: 0
        };
    }
}
