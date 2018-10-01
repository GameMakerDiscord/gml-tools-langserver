import { grammar, Grammar } from "ohm-js";
import * as fse from "fs-extra";
import * as path from "path";
import { FileSystem, DocumentFolder } from "./fileSystem";
import { GMLHoverProvider } from "./hover";
import { timeUtil } from "./utils";
import {
	IConnection,
	Diagnostic,
	Hover,
	TextDocumentContentChangeEvent,
	TextDocumentPositionParams,
	WorkspaceFolder,
	DidOpenTextDocumentParams,
	CompletionParams,
	CompletionItem,
	FoldingRangeRequestParam,
	ReferenceParams
} from "vscode-languageserver/lib/main";
import { DiagnosticHandler, LintPackageFactory, DiagnosticsPackage, LintPackage } from "./diagnostic";
import { Reference } from "./reference";
import { GMLDefinitionProvider } from "./definition";
import { GMLSignatureProvider } from "./signature";
import { GMLCompletionProvider } from "./completion";
import {
	SemanticsOption,
	CreateObjPackage,
	LanguageService,
	GMLDocs,
	GMLToolsSettings
} from "./declarations";
import { DocumentationImporter, FnamesParse } from "./documentationImporter";
import { EventsPackage } from "./sharedTypes";
import { FoldingRange } from "vscode-languageserver-protocol/lib/protocol.foldingRange";

export class LangServ {
	readonly gmlGrammar: Grammar;
	public fsManager: FileSystem;
	public gmlHoverProvider: GMLHoverProvider;
	public gmlDefinitionProvider: GMLDefinitionProvider;
	public gmlSignatureProvider: GMLSignatureProvider;
	public gmlCompletionProvider: GMLCompletionProvider;
	public reference: Reference;
	public documentationImporter: DocumentationImporter;
	public timer: timeUtil;
	public userSettings: GMLToolsSettings.Config;
	private originalOpenDocuments: DidOpenTextDocumentParams[];
	readonly __dirName: string;

	constructor(public connection: IConnection) {
		this.connection = connection;
		this.originalOpenDocuments = [];
		this.gmlGrammar = grammar(
			fse.readFileSync(path.join(__dirname, path.normalize("../lib/gmlGrammar.ohm")), "utf-8")
		);
		this.__dirName = path.normalize(__dirname);

		// Create our tools:
		this.reference = new Reference(this);
		this.documentationImporter = new DocumentationImporter(this, this.reference);
		this.fsManager = new FileSystem(this.gmlGrammar, this);

		//#region Language Services
		this.gmlHoverProvider = new GMLHoverProvider(this.reference, this.fsManager);
		this.gmlDefinitionProvider = new GMLDefinitionProvider(this.reference, this);
		this.gmlSignatureProvider = new GMLSignatureProvider(this.reference, this.fsManager);
		this.gmlCompletionProvider = new GMLCompletionProvider(this.reference, this.fsManager);
		this.timer = new timeUtil();

		// Basic User Settings
		this.userSettings = {
			numberOfDocumentationSentences: 1,
			preferredSpellings: GMLToolsSettings.SpellingSettings.american
		};
		//#endregion
	}

	//#region Init
	public async workspaceBegin(workspaceFolder: WorkspaceFolder[]) {
		// Let the FileSystem do its index thing...
		await this.fsManager.initialWorkspaceFolders(workspaceFolder);

		// Check or Create the Manual:
		let ourManual: [GMLDocs.DocFile,FnamesParse]  | null;
		let cacheManual = false;
		try {
			const encodedText = fse.readFileSync(
				path.join(this.__dirName, path.normalize("../lib/gmlDocs.json")),
				"utf8"
			);
			ourManual = JSON.parse(encodedText);
		} catch (err) {
			ourManual = await this.documentationImporter.createManual();
			cacheManual = true;
		}

		// If we have a manual, load it into memory:
		if (ourManual) {
			// Load our Manual into Memory
			this.reference.initGMLDocs(ourManual[0]);

			// Cache the Manual:
			if (cacheManual) {
				fse.writeFileSync(
					path.join(this.__dirName, path.normalize("../lib/gmlDocs.json")),
					JSON.stringify(ourManual, null, 4)
				);
			}
		} else {
			this.connection.window.showWarningMessage("Manual not correctly loaded. Please make sure GMS2 is\ninstalled correctly. If the error persists,\n please log an error on the Github page.")
			console.log("OH NO -- manual not found or loaded. Big errors.");
		}

		// Create project-documentation
		if ((await this.fsManager.isFileCached("project-documentation.json")) == false) {
			this.fsManager.initProjDocs(this.__dirName);
		}

		// Install Watcher:
		this.fsManager.installProjectDocWatcher(this.__dirName);

		// Get our Configuration
		this.userSettings = await this.connection.workspace.getConfiguration({
			section: "gml-tools"
		});

		// Assign our settings, per setting:
		this.gmlHoverProvider.numberOfSentences = this.userSettings.numberOfDocumentationSentences;
	}

	public async initialIndex() {
		await this.fsManager.initialParseYYP();
	}

	public async findNewSettings(): Promise<{ [prop: string]: string }> {
		if (!this.userSettings) return {};
		// Get our Settings:
		const newSettings = await this.connection.workspace.getConfiguration({
			section: "gml-tools"
		});

		// Iterate over to find our changed settings:
		const ourSettings = Object.keys(newSettings);
		let changedSettings: any = {};

		for (const thisSetting of ourSettings) {
			if (JSON.stringify(newSettings[thisSetting]) != JSON.stringify(this.userSettings[thisSetting])) {
				changedSettings[thisSetting] = newSettings[thisSetting];
			}
		}

		// Commit our changed Configs
		return changedSettings;
	}

	public async updateSettings(changedSettings: { [key: string]: any }) {
		const newSettings = Object.keys(changedSettings);

		// Iterate on the settings
		for (const thisSetting of newSettings) {
			if (thisSetting == "preferredSpellings") {
				if (
					changedSettings[thisSetting] == GMLToolsSettings.SpellingSettings.american ||
					changedSettings[thisSetting] == GMLToolsSettings.SpellingSettings.british ||
					changedSettings[thisSetting] == GMLToolsSettings.SpellingSettings.noPref
				) {
					this.userSettings.preferredSpellings = changedSettings[thisSetting];

					this.connection.window.showWarningMessage("Please Restart VSCode for Setting to Take Effect.");

					try {
						this.fsManager.deletedCachedFile("gmlDocs.json");
					} catch (err) {
						throw err;
					}
				}
			}

			if (thisSetting == "numberOfDocumentationSentences") {
				this.userSettings.numberOfDocumentationSentences = changedSettings[thisSetting];
				// Assign our settings, per setting:
				this.gmlHoverProvider.numberOfSentences = this.userSettings.numberOfDocumentationSentences;
			}
		}
	}

	public isServerReady() {
		return this.fsManager.indexComplete;
	}
	//#endregion

	//#region Text Events
	public async openTextDocument(params: DidOpenTextDocumentParams) {
		// Commit to open Q if indexing still...
		if (this.isServerReady() == false) {
			this.originalOpenDocuments.push(params);
			return;
		}

		const uri = params.textDocument.uri;
		const text = params.textDocument.text;

		const thisDiagnostic = await this.fsManager.getDiagnosticHandler(uri);
		await thisDiagnostic.setInput(text);
		this.fsManager.addDocument(uri, text);
		this.fsManager.addOpenDocument(uri);

		const finalDiagnosticPackage = await this.lint(thisDiagnostic, SemanticsOption.All);

		// Send Final Diagnostics
		this.connection.sendDiagnostics(DiagnosticsPackage.create(uri, finalDiagnosticPackage));
	}

	public async changedTextDocument(uri: string, contentChanges: Array<TextDocumentContentChangeEvent>) {
		if (this.isServerReady() == false) return;

		// Find our Diagnostic:
		const thisDiagnostic = await this.fsManager.getDiagnosticHandler(uri);

		// Set our Input: TODO make this server actually incremental.
		for (const contentChange of contentChanges) {
			await thisDiagnostic.setInput(contentChange.text);
		}

		this.fsManager.addDocument(uri, thisDiagnostic.getInput());
		const finalDiagnosticPackage = await this.lint(thisDiagnostic, SemanticsOption.All);
		// Send Final Diagnostics
		this.connection.sendDiagnostics(DiagnosticsPackage.create(uri, finalDiagnosticPackage));
	}
	//#endregion

	//#region Diagnostics
	public async initLint(thisDiagnostic: DiagnosticHandler): Promise<LintPackage> {
		// Set up:
		let lintPackage = LintPackageFactory.createBlank();

		return lintPackage;
	}

	public async getMatchResultsPackage(thisDiagnostic: DiagnosticHandler, lintPackage: LintPackage) {
		if (thisDiagnostic.match() == false) {
			await thisDiagnostic.primarySyntaxLint(lintPackage);

			return lintPackage.getDiagnostics();
		} else {
			// get our Signature token list (we do this in Primary Syntax on success...)
			await thisDiagnostic.createSignatureTokenListGoodMatch();

			// This is a blank diagnostic. TODO: make the MatchResultsPackage creation less absurd.
			lintPackage.setMatchResultsPackage([
				{
					indexRange: { startIndex: 0 },
					matchResult: thisDiagnostic.getMatchResult()
				}
			]);
			return lintPackage.getDiagnostics();
		}
	}

	public async lint(thisDiagnostic: DiagnosticHandler, bit: SemanticsOption) {
		let lintPack = await this.initLint(thisDiagnostic);
		const initDiagnostics = await this.getMatchResultsPackage(thisDiagnostic, lintPack);
		const semDiagnostics = await this.runSemantics(thisDiagnostic, lintPack, bit);

		return initDiagnostics.concat(semDiagnostics);
	}

	public async runSemantics(thisDiagnostic: DiagnosticHandler, lintPackage: LintPackage, bit: SemanticsOption) {
		let diagnosticArray: Diagnostic[] = [];

		// Semantic Lint
		if ((bit & SemanticsOption.Function) == SemanticsOption.Function) {
			diagnosticArray = diagnosticArray.concat(
				await this.semanticLint(thisDiagnostic, lintPackage, diagnosticArray)
			);
		}

		// Variable Index
		if ((bit & SemanticsOption.Variable) == SemanticsOption.Variable) {
			await this.semanticVariableIndex(thisDiagnostic, lintPackage);
		}

		// JSDOC
		if ((bit & SemanticsOption.JavaDoc) == SemanticsOption.JavaDoc) {
			const docInfo = await this.fsManager.getDocumentFolder(thisDiagnostic.getURI);
			if (docInfo && docInfo.type) {
				await this.semanticJSDOC(thisDiagnostic, lintPackage, docInfo);
			}
		}

		return diagnosticArray;
	}

	public async semanticLint(
		thisDiagnostic: DiagnosticHandler,
		lintPackage: LintPackage,
		diagnosticArray: Diagnostic[]
	) {
		// Clear our Ranges:
		// this.reference.foldingClearAllFoldingRange(thisDiagnostic.getURI);

		// Clear our Script References
		this.reference.scriptRemoveAllReferencesAtURI(thisDiagnostic.getURI)

		// Run Semantics on Existing MatchResults.
		const theseMatchResults = lintPackage.getMatchResults();
		if (theseMatchResults) {
			await thisDiagnostic.runSemanticLintOperation(theseMatchResults);
		}
		diagnosticArray = diagnosticArray.concat(thisDiagnostic.popSemanticDiagnostics());

		return diagnosticArray;
	}

	public async semanticVariableIndex(thisDiagnostic: DiagnosticHandler, lintPackage: LintPackage) {
		const ourURI = thisDiagnostic.getURI;
		const theseMatchResults = lintPackage.getMatchResults();
		if (!theseMatchResults) return;
		const URIInformation = await this.fsManager.getDocumentFolder(ourURI);
		if (!URIInformation) return;
		
		// Clear out all our Clearables
		await this.reference.URIRecordClearAtURI(ourURI);

		thisDiagnostic.runSemanticIndexVariableOperation(theseMatchResults, URIInformation);
	}

	public async semanticJSDOC(thisDiagnostic: DiagnosticHandler, lintPackage: LintPackage, docInfo: DocumentFolder) {
		const matchResults = lintPackage.getMatchResults();
		if (!matchResults) return;
		const ourJSDOC = await thisDiagnostic.runSemanticJSDOC(matchResults, docInfo.name);

		this.reference.scriptAddJSDOC(docInfo.name, ourJSDOC);
	}
	//#endregion

	//#region Type Service Calls
	public async hoverOnHover(params: TextDocumentPositionParams): Promise<Hover | null> {
		if (this.isServerReady() == false) return null;
		return await this.gmlHoverProvider.provideHover(params);
	}

	public onDefinitionRequest(params: TextDocumentPositionParams) {
		if (this.isServerReady() == false) return null;
		return this.gmlDefinitionProvider.onDefinitionRequest(params);
	}

	public async onSignatureRequest(params: TextDocumentPositionParams) {
		if (this.isServerReady() == false) return null;
		return await this.gmlSignatureProvider.onSignatureRequest(params);
	}

	public onCompletionRequest(params: CompletionParams) {
		if (this.isServerReady() == false) return null;
		return this.gmlCompletionProvider.onCompletionRequest(params);
	}

	public async onCompletionResolveRequest(params: CompletionItem) {
		if (this.isServerReady() == false) return params;
		return await this.gmlCompletionProvider.onCompletionResolveRequest(params);
	}
	/**
	 * How Folding Works in this LSP: GML only provides dynamic folding with
	 * #region and #endregion syntax. Our grammar uses these as if they were
	 * part of the language (which can, if one tries hard, produce strange
	 * false positives), and, as such, we parse them with a visitor during the
	 * "Lint" operation.
	 * In that operation, the DiagnosticHandler sends the parsed ranges to the
	 * Reference, who keeps them. Here, all we do is retrieve them from the
	 * reference.
	 * @param params Essentially, the URI of the document.
	 */
	public async onFoldingRanges(params: FoldingRangeRequestParam): Promise<FoldingRange[] | null> {
		const ranges = this.reference.foldingGetFoldingRange(params.textDocument.uri);
		if (ranges) {
			return ranges;
		}
		return null;
	}

	public async onShowAllReferences(params: ReferenceParams) {
		return await this.gmlDefinitionProvider.onShowAllReferencesRequest(params);
	}
	//#endregion

	//#region Commands
	public async createObject(objectPackage: CreateObjPackage) {
		// Basic Conversions straight here:
		if (typeof objectPackage.objectEvents == "string") {
			objectPackage.objectEvents = objectPackage.objectEvents.toLowerCase().split(",");
			objectPackage.objectEvents = objectPackage.objectEvents.map(function(x) {
				return x.trim();
			});
		}

		objectPackage.objectName = objectPackage.objectName.trim();

		// Valid name
		if (this.isValidResourceName(objectPackage.objectName) == false) {
			this.connection.window.showErrorMessage(
				"Invalid object name given. Resource names should only contain 0-9, a-z, A-Z, or _, and they should not start with 0-9."
			);
			return;
		}

		// Check for duplicate resources:
		if (this.resourceExistsAlready(objectPackage.objectName)) {
			this.connection.window.showErrorMessage("Invalid object name given. Resource already exists.");
			return;
		}

		// If we made it here, send to the FS for the rest.
		const ourGMLFilePath = await this.fsManager.createObject(objectPackage);
		if (ourGMLFilePath) {
			this.connection.sendNotification("goToURI", ourGMLFilePath);
		}
	}

	public async createScript(scriptName: string) {
		// Basic Check
		if (this.isValidResourceName(scriptName) == false) {
			this.connection.window.showErrorMessage(
				"Invalid object name given. Resource names should only contain 0-9, a-z, A-Z, or _, and they should not start with 0-9."
			);
			return;
		}

		// Check for duplicate resources:
		if (this.resourceExistsAlready(scriptName)) {
			this.connection.window.showErrorMessage("Invalid script name given. Resource already exists.");
			return;
		}

		const ourGMLFilePath = await this.fsManager.createScript(scriptName);
		if (ourGMLFilePath) {
			this.connection.sendNotification("goToURI", ourGMLFilePath);
		}
	}

	public async addEvents(events: EventsPackage) {
		let eventsArray = events.events.toLowerCase().split(",");
		eventsArray = eventsArray.map(function(x) {
			return x.trim();
		});

		// Send it to fs_manager
		const ourGMLFilePath = await this.fsManager.addEvents({
			events: eventsArray,
			uri: events.uri
		});
		if (ourGMLFilePath) {
			this.connection.sendNotification("goToURI", ourGMLFilePath);
		}
	}

	public beginCompile(type: "test" | "zip" | "installer", yyc: boolean, output?: string) {
		return this.fsManager.compile(type, yyc, output);
	}

	public async forceReIndex() {
		this.connection.window.showWarningMessage("Reindexing...Type services may be limited until index is complete.");
		this.reference.clearAllData();
		await this.fsManager.clearAllData();
	}

	//#endregion

	//#region Utilities
	public requestLanguageServiceHandler(thisHandle: LanguageService): any {
		switch (thisHandle) {
			case LanguageService.FileSystem:
				return this.fsManager;

			case LanguageService.GMLCompletionProvider:
				return this.gmlCompletionProvider;

			case LanguageService.GMLDefinitionProvider:
				return this.gmlDefinitionProvider;

			case LanguageService.GMLHoverProvider:
				return this.gmlHoverProvider;

			case LanguageService.GMLSignatureProvider:
				return this.gmlSignatureProvider;

			case LanguageService.Reference:
				return this.reference;
		}
	}

	private isValidResourceName(name: string) {
		return /^[a-z_]+[a-z0-9_]*$/i.test(name);
	}

	private resourceExistsAlready(name: string) {
		return this.reference.resourceExists(name);
	}

	//#endregion
}
