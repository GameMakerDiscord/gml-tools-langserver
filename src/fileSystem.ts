import { WorkspaceFolder } from "vscode-languageserver/lib/main";
import * as fse from "fs-extra";
import * as path from "path";
import { Grammar } from "ohm-js";
import { DiagnosticHandler } from "./diagnostic";
import { LSP } from "./lsp";
import { Reference } from "./reference";
import * as upath from "upath";
import * as uuidv4 from "uuid/v4";
import URI from "vscode-uri/lib/umd";
import * as chokidar from "chokidar";
import {
	SemanticsOption,
	CreateObjPackage,
	AddEventsPackage,
	ResourceType,
	DocFunctionEntry,
	DocParams
} from "./declarations";
import * as rubber from "gamemaker-rubber";
import { Resource, EventType, EventNumber, YYP, YYPResource } from "yyp-typings";

export interface GMLScriptContainer {
	[propName: string]: GMLScript;
}

export interface GMLScript {
	directoryFilepath: string;
	gmlFile: string;
	yyFile: Resource.Script | string;
}

export interface JSDOC {
	signature: string;
	returns: string;
	parameterCount: number;
	parameters: Array<JSDOCParameter>;
	description: string;
	isScript: boolean;
}

export interface JSDOCParameter {
	label: string;
	documentation: string;
	type: string;
}

export interface GMLObjectContainer {
	[propName: string]: GMLObject;
}

export interface GMLObject {
	directoryFilepath: string;
	events: Array<EventInterface>;
	yyFile: Resource.Object;
}

export interface GMLSpriteContainer {
	[spriteName: string]: GMLSprite;
}

export interface GMLSprite {
	directoryFilepath: string;
	yyFile: Resource.Sprite;
}

export interface EventInterface {
	eventType: EventType;
	eventNumb: number;
	eventID: string;
	eventPath: string;
}

export interface DiagnosticDictionary {
	[index: string]: DiagnosticHandler;
}

export interface GrammarInterface {
	/**
	 * This is the normal Grammar we use to reference
	 * GML.
	 */
	standardGrammar: Grammar;
}

export interface DocumentFolders {
	[uri: string]: DocumentFolder;
}

export interface DocumentFolder {
	name: string;
	type: ResourceType;
	file: string;
}

export interface EventKinds {
	evType: EventType;
	evNumber: EventNumber;
}

/**
 * This is a copy of the normal Resource.GMFolder interface,
 * except that it allows for children to be other GMLFolders.
 */
export interface GMLFolder {
	/** Resource GUID */
	id: string;

	/** Internal resource type descriptor */
	modelName: string;

	/** Version string, appears to be 1.0 or 1.1 */
	mvc: string;

	/** Resource name */
	name: string;

	/** An array of the views/resource GUIDs which this folder contains. */
	children: GMLFolderChildView;

	/** The FilterType of the View */
	filterType: string;

	/** The folder name itself */
	folderName: string;

	/** Indicates if the view is the Default Node. */
	isDefaultView: boolean;

	/** A code, likely used for adding localizations. */
	localisedFolderName: string;
}

export interface GMLFolderChildView {
	[newView: string]: GMLFolder | string;
}

export interface TempFolder {
	tempID: string;
	tempPath: string;
}

export interface CompileProjInfo {
	project_dir: string;
	project_path: string;
	project_name: string;

	temp_id: string;
	temp_path: string;
}

export interface Build {
	assetCompiler: string;
	debug: string;
	compile_output_file_name: string;
	useShaders: string;
	steamOptions: string;
	config: string;
	outputFolder: string;
	projectName: string;
	projectDir: string;
	preferences: string;
	projectPath: string;
	tempFolder: string;
	userDir: string;
	runtimeLocation: string;
	applicationPath: string;
	macros: string;
	targetOptions: string;
	targetMask: string;
	verbose: string;
	helpPort: string;
	debuggerPort: string;
}

export interface CompileOptions {
	yyc: boolean;
	test: boolean;
	debug: boolean;
	verbose: boolean;
	config: string;
	zip: undefined;
	installer: undefined;
}

/**
 * The FileSystem class is our document manager. It handles
 * I/O for the system, and stores the locations of our Document
 * DiagnosticHandlers. In the future, we might look into moving
 * the DiagnosticHandlers to the LSP class.
 */
export class FileSystem {
	/**
	 * Contains all the object names, paths, and GML files.
	 * Find all object DiagnosticHandlers by checking this.
	 */
	private objects: GMLObjectContainer;
	/**
	 * Contains all the script names, paths, and GML files.
	 * Find all script DiagnosticHandlers by checking this.
	 */
	private scripts: GMLScriptContainer;
	// /**
	//  * Contains all the declarations. Find them written out here
	//  * as if they were similar to objects.
	//  */
	// private declarations: object;
	/**
	 * The top level folder of the workplace. Everything
	 * happens in here.
	 */
	private projectDirectory: string;
	/**
	 * A boolean we manipulate to check if the GMFolder exists. This
	 * must be maintained when working with the folder for
	 * performance.
	 */
	// private gmFolderExists: boolean;
	// /**
	//  * A dictionary which combines the URIs of the objects and scripts
	//  * into one resource, so the DiagnosticHandler appropriate
	//  * for a given change can be summoned quickly.
	//  */
	private diagnosticDictionary: DiagnosticDictionary;
	/**
	 * All the folders and files in this.topLevelFolder
	 */
	private topLevelDirectories: Array<string>;

	/**
	 * Grammar object, which can contain more than one
	 * Ohm grammar. This is where we could load in Grammars
	 * for shaders, if we wanted to make that ourselves.
	 */
	private grammars: GrammarInterface;

	/**
	 * The LSP, which is the main controller object of the server.
	 * It will eventually be renamed "langserver"
	 */
	private lsp: LSP;

	/**
	 * Reference contains all the objects and scripts reference packets,
	 * to be used in Language Services. We load them in here in the FileSystem.
	 */
	private reference: Reference;

	/**
	 * This a reverse of the object/script maps, where pluggin in a URI (not a path)
	 * and get the object name and type. It does not give the path to the object --
	 * simply do the conversion for that.
	 */
	private documents: DocumentFolders;

	/**
	 * This is an array of active documents. Primarily used to apply more complicated
	 * semantics on documents already opened.
	 */
	private openedDocuments: Array<string>;

	/**
	 * Checks whether or not the initial indexing is complete.
	 */
	public indexComplete: boolean;

	/**
	 * This is the project's YYP file. Take care in handling this,
	 * as it can easily corrupt a client's project.
	 */
	private projectYYP: YYP;
	/**
	 * Path to the project's YYP, not the directory.
	 * Use `projectDirectory` for that.
	 */
	private projectYYPPath: string;
	/**
	 * This is simply the name of the project!
	 */
	public projectName: string;

	// private options: Array<Resource.Options>;
	// private rooms: Array<Resource.Room>;
	private sprites: GMLSpriteContainer;
	private views: Array<GMLFolder>;
	// private defaultView: GMLFolder;
	// private tilesets: Array<Resource.Tileset>;
	// private fonts: Array<Resource.Font>;
	// private extensions: Array<Resource.Extension>;
	// private shaders: Array<Resource.Shader>;

	private preferences_cache: any;
	private workspaceFolder: WorkspaceFolder[];
	private yypWatcher: chokidar.FSWatcher;
	private resourceKeys: Array<string>;
	private originalYYP: YYP;

	constructor(standardGrammar: Grammar, lsp: LSP) {
		this.objects = {};
		this.scripts = {};
		// this.options = [];
		this.sprites = {};
		this.views = [];
		// this.declarations = {};
		// this.gmFolderExists = false;
		this.diagnosticDictionary = {};
		this.grammars = {
			standardGrammar: standardGrammar
		};
		this.lsp = lsp;
		this.reference = this.lsp.reference;
		this.documents = {};
		this.openedDocuments = [];
		this.indexComplete = false;
		this.workspaceFolder = [];
		this.resourceKeys = [];
	}
	//#region Initialization
	public async initialWorkspaceFolders(workspaceFolder: WorkspaceFolder[]) {
		this.workspaceFolder = workspaceFolder;
		this.projectDirectory = URI.parse(this.workspaceFolder[0].uri).fsPath;

		// Get our Directories
		this.topLevelDirectories = await fse.readdir(this.projectDirectory);

		// Attempt to Index by YYP
		let yypDir = [];
		for (const thisDir of this.topLevelDirectories) {
			const possibleYYP = thisDir.split(".");

			if (possibleYYP[1] == "yyp") {
				yypDir.push(possibleYYP.join("."));
			}
		}

		if (yypDir.length > 1) {
			this.lsp.connection.window.showErrorMessage(
				"More than one YYP present. Cannot index. Type services will be limited."
			);
			return;
		}

		if (yypDir.length == 1) {
			this.projectYYPPath = path.join(this.projectDirectory, yypDir[0]);
			this.projectName = path.basename(this.projectYYPPath, ".yyp");

			// Add our File Watcher:
			this.yypWatcher = chokidar.watch(this.projectYYPPath);
			this.yypWatcher.on("all", async (someEvent, somePath, someStats) => {
				this.watchYYP(someEvent, somePath, someStats);
			});

			// basic set up:
			this.projectYYP = JSON.parse(await fse.readFile(this.projectYYPPath, "utf8"));
			this.originalYYP = this.projectYYP;

			await this.indexYYP(this.projectYYP, true);
			this.lsp.connection.window.showInformationMessage(
				"Index Complete. GML-Tools is in beta; always back up your project."
			);
			this.indexComplete = true;
		} else {
			this.lsp.connection.window.showErrorMessage("No YYP present. Cannot index. Type services will be limited.");
			return;
		}
	}

	private async indexYYP(thisYYP: YYP, reIndexViews?: boolean) {
		this.lsp.connection.window.showInformationMessage("Indexing Project, please hold...");
		reIndexViews = reIndexViews || false;
		// views stuff
		let nonRootViews: Array<Resource.GMFolder> = [];
		let rootViews: Array<Resource.GMFolder> = [];

		// go through all the resources, putting them all out
		// into different files
		for (const thisResource of thisYYP.resources) {
			const yyFilePath = path.join(this.projectDirectory, upath.toUnix(thisResource.Value.resourcePath));
			const dirPath = path.dirname(yyFilePath);

			// Add to the Resource Keys
			this.resourceKeys.push(thisResource.Key);

			switch (thisResource.Value.resourceType) {
				case "GMObject":
					let objYY: Resource.Object;
					try {
						objYY = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					} catch (error) {
						console.log("File: " + yyFilePath + " does not exist. Skipping...");
						continue;
					}

					// Add to our Reference
					this.reference.addObject(objYY.name);

					// Figure out our events
					let ourEvents: Array<EventInterface> = [];
					for (const thisEvent of objYY.eventList) {
						const ourPath = this.convertEventEnumToFPath(thisEvent, dirPath);

						ourEvents.push({
							eventType: thisEvent.eventtype,
							eventNumb: thisEvent.enumb,
							eventID: thisEvent.id,
							eventPath: ourPath
						});
						await this.createDocumentFolder(ourPath, objYY.name, ResourceType.Object);
						await this.initialDiagnostics(ourPath, SemanticsOption.Function | SemanticsOption.Variable);
					}

					// Push to Our References.
					this.objects[objYY.name] = {
						directoryFilepath: dirPath,
						yyFile: objYY,
						events: ourEvents
					};
					this.reference.addResource(objYY.name);
					break;

				case "GMScript":
					let scriptYY: Resource.Script;

					try {
						scriptYY = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					} catch (error) {
						console.log("File: " + yyFilePath + " does not exist. Skipping...");
						continue;
					}

					const scriptFP = path.join(dirPath, scriptYY.name + ".gml");
					let thisScript: GMLScript = {
						directoryFilepath: dirPath,
						gmlFile: scriptFP,
						yyFile: scriptYY
					};
					this.reference.scriptAddScript(scriptYY.name, URI.file(scriptFP));
					await this.createDocumentFolder(scriptFP, scriptYY.name, ResourceType.Script);
					await this.initialDiagnostics(
						scriptFP,
						SemanticsOption.Function | SemanticsOption.EnumsAndMacros | SemanticsOption.JavaDoc
					);

					this.scripts[scriptYY.name] = thisScript;
					this.reference.addResource(scriptYY.name);
					break;

				case "GMSprite":
					const spriteYY: Resource.Sprite = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					this.sprites[spriteYY.name] = {
						directoryFilepath: dirPath,
						yyFile: spriteYY
					};

					// Add it to the reference
					this.reference.spriteAddSprite(spriteYY.name);
					this.reference.addResource(spriteYY.name);
					break;

				case "GMFolder":
					const viewYY: Resource.GMFolder = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Check if we're a Root:
					if (viewYY.filterType == "root") {
						rootViews.push(viewYY);
					} else nonRootViews.push(viewYY);
					break;

				case "GMTileSet":
					const tsYY: Resource.Tileset = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// References
					this.reference.tilesets.push(tsYY.name);
					this.reference.addResource(tsYY.name);
					break;

				case "GMSound":
					const soundYY: Resource.Sound = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// References
					this.reference.sounds.push(soundYY.name);
					this.reference.addResource(soundYY.name);
					break;

				case "GMPath":
					const pathYY: Resource.Path = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// References
					this.reference.paths.push(pathYY.name);
					this.reference.addResource(pathYY.name);
					break;

				case "GMShader":
					const shaderYY: Resource.Shader = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// References
					this.reference.shaders.push(shaderYY.name);
					this.reference.addResource(shaderYY.name);
					break;

				case "GMFont":
					const fontYY: Resource.Font = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// References
					this.reference.fonts.push(fontYY.name);
					this.reference.addResource(fontYY.modelName);
					break;

				case "GMTimeline":
					const timelineYY: Resource.Timeline = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// References
					this.reference.timeline.push(timelineYY.name);
					this.reference.addResource(timelineYY.name);
					break;

				case "GMRoom":
					const roomYY: Resource.Room = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// References
					this.reference.rooms.push(roomYY.name);
					this.reference.addResource(roomYY.name);
					break;

				case "GMNotes":
					const noteYY: Resource.Note = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// Resources
					this.reference.addResource(noteYY.name);
					break;

				case "GMExtension":
					const extYY: Resource.Extension = JSON.parse(await fse.readFile(yyFilePath, "utf8"));

					// Resources
					this.reference.extensions.push(extYY.name);
					this.reference.addResource(extYY.name);
					break;

				default:
					console.log("We did not index this file: " + dirPath);
			}
		}

		// Finish sorting our views:
		if (reIndexViews) {
			this.sortViews(nonRootViews, rootViews);
		}
	}

	public cacheProject() {
		this._cacheProject();
	}

	private sortViews(nonRoot: Array<Resource.GMFolder>, root: Array<Resource.GMFolder>) {
		// Iterate on our Roots:
		for (const thisRoot of root) {
			// Walk the Tree.
			const finalView = this.walkViewTree(thisRoot, nonRoot);
			this.views.push(finalView);

			// // Add it to the default View
			// if (thisRoot.isDefaultView) {
			//     this.defaultView = finalView;
			// }
		}
	}

	private walkViewTree(initialView: Resource.GMFolder, nonRoot: Array<Resource.GMFolder>): GMLFolder {
		let newChildren: Array<GMLFolder | string> = [];
		let finalView = this.constructGMLFolderFromView(initialView);

		for (const thisChild of initialView.children) {
			// Filter the UUIDs:
			let ourUUID: Resource.GMFolder;
			for (const thisUUID of nonRoot) {
				if (thisUUID.name == thisChild) {
					ourUUID = thisUUID;
					break;
				}
			}

			// Walk down the UUID if it's a view, else store the string.
			if (ourUUID) {
				newChildren.push(this.walkViewTree(ourUUID, nonRoot));
			} else {
				newChildren.push(thisChild);
			}
		}

		// Add the children object as a property to the parent.
		for (const thisChild of newChildren) {
			if (typeof thisChild == "string") {
				finalView.children[thisChild] = thisChild;
			} else {
				finalView.children[thisChild.id] = thisChild;
			}
		}

		return finalView;
	}

	private constructGMLFolderFromView(init: Resource.GMFolder): GMLFolder {
		return {
			name: init.name,
			mvc: init.mvc,
			modelName: init.modelName,
			localisedFolderName: init.localisedFolderName,
			isDefaultView: init.isDefaultView,
			id: init.id,
			folderName: init.folderName,
			filterType: init.filterType,
			children: {}
		};
	}
	//#endregion

	//#region Old Indexing

	private async _cacheProject() {
		// let encodedJSON = JSON.stringify({
		//     objects: this.objects,
		//     scripts: this.scripts,
		//     uri2name: this.uri2normalname
		// });
		// let gmDir = await fse.readdir(this.topLevelFolder + "\\.gmtools");
		// await writeFile(this.topLevelFolder + "\\.gmtools" + "\\__gmtProjCache.json", encodedJSON, "utf8");
		// if (gmDir.includes("declarations.d.gml") == false) {
		//     await writeFile(this.topLevelFolder + "\\.gmtools" + "\\declarations.d.gml", "", "utf8");
		// }
	}
	//#endregion

	//#region Special Indexing Methods
	private async initialDiagnostics(fpath: string, semanticsToRun: SemanticsOption) {
		let fileURI = URI.file(fpath);
		let fileText: string;
		try {
			fileText = await fse.readFile(fpath, "utf8");
		} catch (error) {
			console.log("Could not find file + " + fpath + ". Skipping... \n");
			return;
		}

		await this.addDocument(fileURI.toString(), fileText);
		const thisDiagnostic = await this.getDiagnosticHandler(fileURI.toString());
		await thisDiagnostic.setInput(fileText);

		try {
			await this.lsp.lint(thisDiagnostic, semanticsToRun);
		} catch (error) {
			console.log("Error at " + fpath + ". Error: " + error);
		}

		// Note: we calculate project diagnostics, but we do not currently send them anywhere. That will
		// be a future option. TODO.
		// await this.lsp.connection.sendDiagnostics(DiagnosticsPackage.create(fileURI.toString(), finalDiagnosticPackage));
		this.diagnosticDictionary[fileURI.toString()] = thisDiagnostic;
	}

	private createDiagnosticHandler(fileURI: string) {
		return new DiagnosticHandler(this.grammars.standardGrammar, fileURI, this.reference);
	}

	public async getDiagnosticHandler(uri: string) {
		const thisDiag = this.diagnosticDictionary[uri];

		if (thisDiag == undefined) {
			this.diagnosticDictionary[uri] = this.createDiagnosticHandler(uri);
			return this.diagnosticDictionary[uri];
		} else return thisDiag;
	}
	//#endregion

	//#region Document Handlers

	private async createDocumentFolder(path: string, name: string, type: ResourceType) {
		let uri = URI.file(path);

		this.documents[uri.toString()] = {
			name: name,
			type: type,
			file: null
		};
	}

	public async getDocumentFolder(uri: string): Promise<DocumentFolder | undefined> {
		return this.documents[uri];
	}

	public async getDocument(uri: string) {
		const thisFileFolder = this.documents[uri];
		if (thisFileFolder) {
			return thisFileFolder.file;
		} else return null;
	}

	public async addDocument(uri: string, file: string): Promise<void | null> {
		const thisFileFolder = this.documents[uri];
		if (thisFileFolder) {
			thisFileFolder.file = file;
		} else {
			console.log("Document:" + uri + " doesn't exist!");
			return null;
		}
	}
	//#endregion

	//#region Open Document Methods
	public async addOpenDocument(uri: string) {
		this.openedDocuments.push(uri);
		console.log("Added " + uri);
	}

	public async isOpenDocument(uri: string) {
		return this.openedDocuments.includes(uri);
	}

	public async closeOpenDocument(uri: string) {
		const indexNumber = this.openedDocuments.indexOf(uri);
		if (indexNumber === -1) {
			console.log(
				"Error -- attempting to close a document \n which is not open. \n Make sure you are opening them properly."
			);
			return null;
		}

		this.openedDocuments.splice(indexNumber, 1);
	}

	//#endregion

	//#region Create Resources
	public async createScript(scriptName: string): Promise<string> {
		// Our YY file contents:
		// Generate the new Script:
		const newScript: Resource.Script = {
			name: scriptName,
			mvc: "1.0",
			modelName: "GMScript",
			id: uuidv4(),
			IsDnD: false,
			IsCompatibility: false
		};
		// Create the actual folder/files:
		const ourDirectoryPath = path.join(this.projectDirectory, "scripts", scriptName);
		// Create our "scripts" folder if necessary:
		if (this.topLevelDirectories.includes("scripts") == false) {
			await fse.mkdir(path.join(this.projectDirectory, "scripts"));
		}
		// Create this Scripts folder and its files:
		await fse.mkdir(ourDirectoryPath);
		const ourGMLPath = path.join(ourDirectoryPath, scriptName + ".gml");
		await fse.writeFile(ourGMLPath, "");
		const ourYYPath = path.join(ourDirectoryPath, scriptName + ".yy");
		await fse.writeFile(ourYYPath, JSON.stringify(newScript), "utf8");

		// Add to the script order:
		if (this.projectYYP.script_order) {
			this.projectYYP.script_order.push(newScript.id);
		}
		const rPath = path.join("scripts", scriptName, scriptName + ".yy");

		// Add as a YYP resource:
		this.projectYYP.resources.push(this.createYYPResourceEntry(newScript.id, rPath, "GMScript"));

		// Save the YYP
		await this.saveYYP();

		// Update our own model:
		this.reference.scriptAddScript(newScript.name, URI.file(ourGMLPath));
		await this.createDocumentFolder(ourGMLPath, newScript.name, ResourceType.Script);
		await this.initialDiagnostics(
			ourGMLPath,
			SemanticsOption.Function | SemanticsOption.EnumsAndMacros | SemanticsOption.JavaDoc
		);
		this.reference.addResource(newScript.name);

		this.scripts[scriptName] = {
			yyFile: newScript,
			gmlFile: ourGMLPath,
			directoryFilepath: ourDirectoryPath
		};

		await this.lsp.openTextDocument(URI.file(ourGMLPath).toString(), "");

		return ourGMLPath;
	}

	public async createObject(objPackage: CreateObjPackage): Promise<string> {
		// const spriteInfo = objPackage.sprite == "No Sprite" ? this.sprites[objPackage.sprite];
		const ourUUID = uuidv4();

		let newObject: Resource.Object = {
			id: ourUUID,
			modelName: "GMObject",
			mvc: "1.0",
			name: objPackage.objectName,
			maskSpriteId: "00000000-0000-0000-0000-000000000000",
			overriddenProperties: null,
			properties: null,
			parentObjectId: "00000000-0000-0000-0000-000000000000",
			persistent: false,
			physicsAngularDamping: 0.1,
			physicsDensity: 0.5,
			physicsFriction: 0.2,
			physicsGroup: 0,
			physicsKinematic: false,
			physicsLinearDamping: 0.1,
			physicsObject: false,
			physicsRestitution: 0.1,
			physicsSensor: false,
			physicsShape: 1,
			physicsShapePoints: null,
			physicsStartAwake: true,
			solid: false,
			spriteId: "00000000-0000-0000-0000-000000000000",
			visible: true,
			eventList: []
		};

		// Add our events:
		for (const thisEvent of objPackage.objectEvents) {
			const newEvent = await this.createEvent(thisEvent, ourUUID);
			if (newEvent) {
				newObject.eventList.push(newEvent);
			}
		}

		// Create our YYP Resource.
		const rPath = path.join("objects", objPackage.objectName, objPackage.objectName + ".yy");
		this.projectYYP.resources.push(this.createYYPResourceEntry(ourUUID, rPath, "GMObject"));

		// File Creation set up
		const ourDirectoryPath = path.join(this.projectDirectory, "objects", objPackage.objectName);
		if (this.topLevelDirectories.includes("objects") == false) {
			await fse.mkdir(path.join(this.projectDirectory, "objects"));
		}

		// Actual Directory/File Creation
		await fse.mkdir(ourDirectoryPath);
		const ourYYPath = path.join(ourDirectoryPath, objPackage.objectName + ".yy");
		await fse.writeFile(ourYYPath, JSON.stringify(newObject), "utf8");

		// Each event
		let openEditorHere = null;
		let internalEventModel: EventInterface[] = [];
		for (const thisEvent of newObject.eventList) {
			const thisFP = this.convertEventEnumToFPath(thisEvent, ourDirectoryPath);

			if (openEditorHere === null) {
				openEditorHere = thisFP;
			}
			await fse.writeFile(thisFP, "");

			internalEventModel.push({
				eventID: thisEvent.id,
				eventNumb: thisEvent.enumb,
				eventPath: thisFP,
				eventType: thisEvent.eventtype
			});
			await this.createDocumentFolder(thisFP, newObject.name, ResourceType.Object);
			await this.initialDiagnostics(thisFP, SemanticsOption.Function | SemanticsOption.Variable);
		}
		this.saveYYP();

		// Update Our Interal Model:
		this.objects[newObject.name] = {
			directoryFilepath: ourDirectoryPath,
			yyFile: newObject,
			events: internalEventModel
		};
		this.reference.addResource(newObject.name);

		return openEditorHere;
	}

	public async addEvents(pack: AddEventsPackage) {
		// Grab our object's file:
		const objInfo = await this.getDocumentFolder(pack.uri);
		if (objInfo.type !== ResourceType.Object) {
			return null;
		}
		const thisObj = this.objects[objInfo.name];

		// This is how we get a return path to go to:
		let returnPath: string = null;

		// Create the files and update our Internal YY files
		for (const thisEvent of pack.events) {
			const newEvent = await this.createEvent(thisEvent, thisObj.yyFile.id);
			if (newEvent) {
				const fpath = this.convertEventEnumToFPath(newEvent, thisObj.directoryFilepath);
				if (returnPath === null) {
					returnPath = fpath;
				}

				// Make sure not a duplicate:
				for (const pastEvent of thisObj.events) {
					if (pastEvent.eventNumb == newEvent.enumb && pastEvent.eventType == newEvent.eventtype) {
						this.lsp.connection.window.showWarningMessage(
							"Attempted to create event which already exists. Event not created."
						);
						continue;
					}
				}

				// Push to Object Events
				thisObj.events.push({
					eventID: newEvent.id,
					eventPath: fpath,
					eventNumb: newEvent.enumb,
					eventType: newEvent.eventtype
				});
				thisObj.yyFile.eventList.push(newEvent);

				await fse.writeFile(fpath, "");

				await this.createDocumentFolder(fpath, thisObj.yyFile.name, ResourceType.Object);
				await this.initialDiagnostics(fpath, SemanticsOption.Function | SemanticsOption.Variable);
			}
		}

		// Rewrite our event.yy file:
		await fse.writeFile(
			path.join(thisObj.directoryFilepath, thisObj.yyFile.name + ".yy"),
			JSON.stringify(thisObj.yyFile, null, 4)
		);

		return returnPath;
	}

	private async createEvent(eventName: string, ownerUUID: string): Promise<Resource.ObjectEvent> {
		const eventObj = await this.convertStringToEventType(eventName);
		if (eventObj) {
			return {
				id: uuidv4(),
				modelName: "GMEvent",
				mvc: "1.0",
				IsDnD: false,
				collisionObjectId: "00000000-0000-0000-0000-000000000000",
				enumb: eventObj.evNumber,
				eventtype: eventObj.evType,
				m_owner: ownerUUID
			};
		} else return null;
	}

	public async saveYYP() {
		await fse.writeFile(this.projectYYPPath, JSON.stringify(this.projectYYP), "utf8");
	}

	/**
	 * Creates and return a YYPResource.
	 * @param resourceID The UUID of the resource to create.
	 * @param resourcePath The filepath, relative to YYP, of the resource.
	 * @param resourceType A string, such as "GMScript" or "GMObject".
	 */
	private createYYPResourceEntry(resourceID: string, rPath: string, rType: string): YYPResource {
		return {
			Key: resourceID,
			Value: {
				id: uuidv4(),
				modelName: "GMResourceInfo",
				mvc: "1.0",
				configDeltaFiles: [],
				configDeltas: [],
				resourceCreationConfigs: ["default"],
				resourcePath: rPath,
				resourceType: rType
			}
		};
	}

	private convertEventEnumToFPath(thisEvent: Resource.ObjectEvent, dirPath: string): string {
		switch (thisEvent.eventtype) {
			case EventType.Create:
				return path.join(dirPath, "Create_0.gml");
			case EventType.Alarm:
				return path.join(dirPath, "Alarm_" + thisEvent.enumb.toString() + ".gml");
			case EventType.Destroy:
				return path.join(dirPath, "Destroy_0.gml");
			case EventType.Step:
				return path.join(dirPath, "Step_" + thisEvent.enumb.toString() + ".gml");
			case EventType.Collision:
				return path.join(dirPath, "Collision_" + thisEvent.id + ".gml");
			case EventType.Keyboard:
				return path.join(dirPath, "Keyboard_" + thisEvent.enumb.toString() + ".gml");
			case EventType.Mouse:
				return path.join(dirPath, "Mouse_" + thisEvent.enumb.toString() + ".gml");
			case EventType.Other:
				return path.join(dirPath, "Other_" + thisEvent.enumb.toString() + ".gml");
			case EventType.Draw:
				return path.join(dirPath, "Draw_" + thisEvent.enumb.toString() + ".gml");
			case EventType.KeyPress:
				return path.join(dirPath, "KeyPress_" + thisEvent.enumb.toString() + ".gml");
			case EventType.KeyRelease:
				return path.join(dirPath, "KeyRelease_" + thisEvent.enumb.toString() + ".gml");
			case EventType.Trigger:
				console.log("We got a Trigger event here. Somehow this project is from GM8?");
				return path.join(dirPath, "Trigger_" + thisEvent.enumb.toString() + ".gml");
			case EventType.CleanUp:
				return path.join(dirPath, "CleanUp_0.gml");
			case EventType.Gesture:
				return path.join(dirPath, "Gesture_" + thisEvent.enumb.toString() + ".gml");
		}
		console.log(
			"NonGML file indexed by YYP? Serious error. \n" +
				"This event: " +
				thisEvent.eventtype +
				"/" +
				thisEvent.enumb +
				"\n" +
				"This directory: " +
				dirPath
		);
		return null;
	}

	private convertStringToEventType(evName: string): EventKinds {
		switch (evName) {
			case "create":
				return {
					evType: EventType.Create,
					evNumber: EventNumber.Create
				};

			case "step":
				return {
					evType: EventType.Step,
					evNumber: EventNumber.StepNormal
				};

			case "draw":
				return {
					evType: EventType.Draw,
					evNumber: EventNumber.DrawNormal
				};

			default:
				this.lsp.connection.window.showErrorMessage(
					"Incorrect event name passed initial checks, but failed at event creation. Did not make an event. Please post an issue on the Github page."
				);
				return null;
		}
	}
	//#endregion

	//#region Compile
	public compile(type: "test" | "zip" | "installer", yyc: boolean, output: string = "") {
		const build = rubber.windows({
			projectPath: this.projectYYPPath,
			build: type,
			outputPath: output,
			yyc
		});
		this.lsp.connection.sendNotification("compile.started");
		build.on("compileStatus", (data) => {
			this.lsp.connection.sendNotification("compile.status", data);
		});
		build.on("gameStatus", (data) => {
			this.lsp.connection.sendNotification("compile.status", data);
		});
		build.on("allFinished", () => {
			this.lsp.connection.sendNotification("compile.finished");
		});
	}

	// #endregion

	//#region Watcher
	private async watchYYP(eventKind: string, ourPath: string, stats: any) {
		switch (eventKind) {
			case "change":
				let newYYP: YYP = JSON.parse(await fse.readFile(ourPath, "utf8"));
				let newResources: Array<YYPResource> = [];
				let deletedResources: Array<YYPResource> = [];
				let keysExisting: Array<string> = [];
				const timeout = (ms) => new Promise((res) => setTimeout(res, ms));

				// Check for New Resources:
				for (const thisResource of newYYP.resources) {
					keysExisting.push(thisResource.Key);
					if (this.resourceKeys.includes(thisResource.Key) == false) {
						newResources.push(thisResource);
					}
				}
				newYYP.resources = newResources;

				// We have to have a timer here, because we're faster than GMS2.
				await timeout(100);
				this.indexYYP(newYYP);

				// Check for Deleted Resources
				for (const thisResource of this.projectYYP.resources) {
					if (keysExisting.includes(thisResource.Key) == false) {
						deletedResources.push(thisResource);
					}
				}
				// Apply the function to everyone:
				for (const thisResource of deletedResources) {
					this.deleteResources(thisResource);
				}

				break;

			default:
				break;
		}
	}

	public async deleteResources(resourceToDelete: YYPResource) {
		// Clear the basic resource
	}

	public async clearAllData() {
		// Iterate on the Diagnostic Dictionary
		for (const key in this.diagnosticDictionary) {
			if (this.diagnosticDictionary.hasOwnProperty(key)) {
				delete this.diagnosticDictionary[key];
			}
		}

		this.objects = {};
		this.scripts = {};
		this.sprites = {};
		this.views = [];

		this.diagnosticDictionary = {};

		this.documents = {};
		this.openedDocuments = [];
		this.indexComplete = false;
		this.initialWorkspaceFolders(this.workspaceFolder);
	}

	//#endregion
}
