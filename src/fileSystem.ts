import { WorkspaceFolder } from "vscode-languageserver/lib/main";
import * as fse from "fs-extra";
import * as path from "path";
import { Grammar } from "ohm-js";
import { DiagnosticHandler } from "./diagnostic";
import { LangServ } from "./langserv";
import { Reference } from "./reference";
import * as upath from "upath";
import * as uuidv4 from "uuid/v4";
import URI from "vscode-uri/lib/umd";
import * as chokidar from "chokidar";
import { SemanticsOption, CreateObjPackage, AddEventsPackage, ResourceType, ResourceNames } from "./declarations";
import * as rubber from "gamemaker-rubber";
import { Resource, EventType, EventNumber, YYP, YYPResource } from "yyp-typings";
import { ClientViewNode } from "./sharedTypes";
import * as Ajv from "ajv";

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
	minParameters: number;
	maxParameters: number;
	parameters: Array<JSDOCParameter>;
	description: string;
	isScript: boolean;
	link?: string;
}

export interface JSDOCParameter {
	label: string;
	documentation: string;
}

export interface GMLObjectContainer {
	[propName: string]: GMLObject;
}

export interface GMLObject {
	directoryFilepath: string;
	events: Array<EventInfo>;
	yyFile: Resource.Object;
}

export interface GMLSpriteContainer {
	[spriteName: string]: GMLSprite;
}

export interface GMLSprite {
	directoryFilepath: string;
	yyFile: Resource.Sprite;
}

export interface EventInfo {
	eventType: EventType;
	eventNumb: EventNumber;
	/** This is the UUID of the event. */
	eventID: string;
	/** This is the relative path to the event's  */
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
	eventInfo?: EventInfo;
}

export interface EventKinds {
	evType: EventType;
	evNumber: EventNumber;
}

type GMResourcePlus = Resource.GMResource | GMLFolder;

/**
 * This is a copy of the normal Resource.GMFolder interface,
 * except that it allows for children to be other GMLFolders.
 */
export interface GMLFolder {
	/** Resource GUID */
	id: string;

	/** Internal resource type descriptor */
	modelName: "GMLFolder";

	/** Version string, appears to be 1.0 or 1.1 */
	mvc: string;

	/** Resource name */
	name: string;

	/** An array of the views/resource GUIDs which this folder contains. */
	children: GMResourcePlus[];

	/** The FilterType of the View */
	filterType: string;

	/** The folder name itself */
	folderName: string;

	/** Indicates if the view is the Default Node. */
	isDefaultView: boolean;

	/** A code, likely used for adding localizations. */
	localisedFolderName: Resource.localisedNames;
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
	private topLevelDirectories: string[];

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
	private lsp: LangServ;

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
	private openedDocuments: string[];

	/**
	 * Checks whether or not the initial indexing is complete.
	 */
	public indexComplete: boolean;

	/**
	 * This is the project's YYP file. Take care in handling this,
	 * as it can easily corrupt a client's project.
	 */
	private projectYYP: YYP | undefined;
	/**
	 * Path to the project's YYP, not the directory.
	 * Use `projectDirectory` for that.
	 */
	private projectYYPPath: string;
	/**
	 * This is simply the name of the project!
	 */
	public projectName: string;
	private sprites: GMLSpriteContainer;
	private views: GMLFolder[];

	/**
	 * This is a dictionary where we put all our UUIDs. We use
	 * it to send our clients our Tree structure. It effectivly represents
	 * the serialization of the project.
	 */
	private projectResourceList: { [UUID: string]: Resource.GMResource };

	private workspaceFolder: WorkspaceFolder[];
	private yypWatcher: chokidar.FSWatcher | undefined;
	private resourceKeys: string[];
	private cachedFileNames: string[] | undefined;
	private defaultView: number;

	constructor(standardGrammar: Grammar, lsp: LangServ) {
		this.objects = {};
		this.scripts = {};
		this.sprites = {};
		this.views = [];
		this.projectResourceList = {};
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
		this.projectDirectory = "";
		this.topLevelDirectories = [];
		this.projectYYPPath = "";
		this.projectName = "";
		this.defaultView = 0;
	}
	//#region Initialization
	public async initialWorkspaceFolders(workspaceFolder: WorkspaceFolder[]) {
		this.workspaceFolder = workspaceFolder;
		this.projectDirectory = URI.parse(this.workspaceFolder[0].uri).fsPath;

		// Get our Directories
		this.topLevelDirectories = await fse.readdir(this.projectDirectory);
	}

	public async initialParseYYP() {
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

		// Do We only have 1 YYFile? Good, we should only ahve one.
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
			if (this.projectYYP) {
				// Index the YYP
				await this.indexYYP(this.projectYYP, true);

				// Notify your dingus user that their index is done:
				this.lsp.connection.window.showInformationMessage(
					"Index Complete. GML-Tools is in beta; always back up your project."
				);
				this.indexComplete = true;
			}
		} else {
			this.lsp.connection.window.showErrorMessage("No YYP present. Cannot index. Type services will be limited.");
			return;
		}
	}

	private async indexYYP(thisYYP: YYP, reIndexViews?: boolean) {
		this.lsp.connection.window.showInformationMessage("Indexing Project, please hold...");
		reIndexViews = reIndexViews || false;
		// views stuff
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
					// Add to UUID Dict
					this.projectResourceList[objYY.id] = objYY;

					// Add to our Reference
					this.reference.addObject(objYY.name);

					// Figure out our events
					let ourEvents: Array<EventInfo> = [];
					for (const thisEvent of objYY.eventList) {
						const ourPath = this.convertEventEnumToFPath(thisEvent, dirPath);
						const thisEventEntry: EventInfo = {
							eventType: thisEvent.eventtype,
							eventNumb: thisEvent.enumb,
							eventID: thisEvent.id,
							eventPath: ourPath
						};

						ourEvents.push(thisEventEntry);
						await this.createDocumentFolder(ourPath, objYY.name, ResourceType.Object, thisEventEntry);
						await this.initialDiagnostics(
							ourPath,
							SemanticsOption.Function | SemanticsOption.Variable
						);
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

					// Add to UUID Dict
					this.projectResourceList[scriptYY.id] = scriptYY;

					const scriptFP = path.join(dirPath, scriptYY.name + ".gml");
					let thisScript: GMLScript = {
						directoryFilepath: dirPath,
						gmlFile: scriptFP,
						yyFile: scriptYY
					};
					this.reference.scriptAddScript(scriptYY.name, URI.file(scriptFP));
					await this.createDocumentFolder(scriptFP, scriptYY.name, ResourceType.Script);
					await this.initialDiagnostics(scriptFP, SemanticsOption.All);

					this.scripts[scriptYY.name] = thisScript;
					this.reference.addResource(scriptYY.name);
					break;

				case "GMSprite":
					const spriteYY: Resource.Sprite = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					this.sprites[spriteYY.name] = {
						directoryFilepath: dirPath,
						yyFile: spriteYY
					};
					// Add to UUID Dict
					this.projectResourceList[spriteYY.id] = spriteYY;

					// Add it to the reference
					this.reference.spriteAddSprite(spriteYY.name);
					this.reference.addResource(spriteYY.name);
					break;

				case "GMFolder":
					const viewYY: Resource.GMFolder = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Check if we're a Root:
					if (viewYY.filterType == "root") {
						rootViews.push(viewYY);
					} else {
						// Add to UUID Dict
						this.projectResourceList[viewYY.id] = viewYY;
					}
					break;

				case "GMTileSet":
					const tsYY: Resource.Tileset = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[tsYY.id] = tsYY;

					// References
					this.reference.tilesets.push(tsYY.name);
					this.reference.addResource(tsYY.name);
					break;

				case "GMSound":
					const soundYY: Resource.Sound = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[soundYY.id] = soundYY;

					// References
					this.reference.sounds.push(soundYY.name);
					this.reference.addResource(soundYY.name);
					break;

				case "GMPath":
					const pathYY: Resource.Path = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[pathYY.id] = pathYY;

					// References
					this.reference.paths.push(pathYY.name);
					this.reference.addResource(pathYY.name);
					break;

				case "GMShader":
					const shaderYY: Resource.Shader = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[shaderYY.id] = shaderYY;

					// References
					this.reference.shaders.push(shaderYY.name);
					this.reference.addResource(shaderYY.name);
					break;

				case "GMFont":
					const fontYY: Resource.Font = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[fontYY.id] = fontYY;

					// References
					this.reference.fonts.push(fontYY.name);
					this.reference.addResource(fontYY.modelName);
					break;

				case "GMTimeline":
					const timelineYY: Resource.Timeline = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[timelineYY.id] = timelineYY;

					// References
					this.reference.timeline.push(timelineYY.name);
					this.reference.addResource(timelineYY.name);
					break;

				case "GMRoom":
					const roomYY: Resource.Room = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[roomYY.id] = roomYY;

					// References
					this.reference.rooms.push(roomYY.name);
					this.reference.addResource(roomYY.name);
					break;

				case "GMNotes":
					const noteYY: Resource.Note = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[noteYY.id] = noteYY;

					// Resources
					this.reference.addResource(noteYY.name);
					break;

				case "GMExtension":
					const extYY: Resource.Extension = JSON.parse(await fse.readFile(yyFilePath, "utf8"));
					// Add to UUID Dict
					this.projectResourceList[extYY.id] = extYY;

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
			this.sortViews(rootViews);
		}
	}

	//#endregion

	//#region Views
	private sortViews(root: Array<Resource.GMFolder>) {
		// Iterate on our Roots:
		for (const thisRoot of root) {
			// Walk the Tree.
			const finalView = this.walkViewTree(thisRoot);
			this.views.push(finalView);

			// Add it to the default View
			if (thisRoot.isDefaultView) {
				this.defaultView = this.views.length - 1;
			}
		}
	}

	private walkViewTree(initialView: Resource.GMFolder): GMLFolder {
		let newChildren: any = [];
		let finalView = this.constructGMLFolderFromGMFolder(initialView);

		for (const thisChildNode of initialView.children) {
			// Find the resource of this UUID by scanning through
			// *all* our UUIDs in `this.projectResourceList`. We
			// add every resource to it in the .YYP.
			const thisChildYY = this.projectResourceList[thisChildNode];
			if (thisChildYY === undefined) continue;

			// Walk down the UUID if it's a view, else store the YY file.
			if (thisChildYY.modelName && thisChildYY.modelName == "GMFolder") {
				newChildren.push(this.walkViewTree(thisChildYY));
			} else {
				newChildren.push(thisChildYY);
			}
		}

		finalView.children = newChildren;
		return finalView;
	}

	public viewsGetInitialViews() {
		return this.viewsGetThisViewClient(this.views[this.defaultView].id);
	}

	public viewsGetThisViewClient(nodeUUID: string): ClientViewNode[] | null {
		const ourNode = this.searchViewsForUUID(nodeUUID);
		if (!ourNode) return [];

		if (ourNode.modelName == "GMLFolder") {
			let returnView: ClientViewNode[] = [];

			for (const thisNode of ourNode.children) {
				const thisView = {
					id: thisNode.id,
					modelName: thisNode.modelName,
					name: thisNode.name,
					fpath: this.createFPFromBase(thisNode)
				};

				if (thisNode.modelName == "GMLFolder" || thisNode.modelName == "GMFolder") {
					thisView.modelName = "GMFolder";
					thisView.name = this.makePrettyFileNames(thisNode.folderName);
				}

				returnView.push(thisView);
			}
			return returnView;
		} else if (ourNode.modelName == "GMObject") {
			let returnView: ClientViewNode[] = [];
			for (const thisEvent of ourNode.eventList) {
				returnView.push({
					fpath: this.convertEventEnumToFPath(thisEvent, this.createFPFromBase(ourNode)),
					id: ourNode.id + ":" + thisEvent.id,
					modelName: "GMEvent",
					name: this.convertEventEnumToName(thisEvent)
				});
			}
			return returnView;
		} else if (ourNode.modelName == "GMShader") {
			const returnView: ClientViewNode[] = [
				{
					fpath: path.join(this.createFPFromBase(ourNode), ourNode.name + ".vsh"),
					id: ourNode.id + ":Vertex",
					modelName: "GMVertexShader",
					name: ourNode.name + ".vsh"
				},
				{
					fpath: path.join(this.createFPFromBase(ourNode), ourNode.name + ".fsh"),
					id: ourNode.id + ":Fragment",
					modelName: "GMFragmentShader",
					name: ourNode.name + ".fsh"
				}
			];
			return returnView;
		} else if (ourNode.modelName == "GMSprite") {
			let returnView: ClientViewNode[] = [];
			const dirPath = this.createFPFromBase(ourNode);
			let frameNumber = 0;

			for (const thisSpriteImage of ourNode.frames) {
				returnView.push({
					fpath: path.join(dirPath, thisSpriteImage.id + ".png"),
					id: thisSpriteImage.id + ":" + ourNode.id,
					modelName: "GMSpriteFrame",
					name: "Frame " + frameNumber
				});
				frameNumber++;
				return returnView;
			}
		}

		return [];
	}

	public async viewsInsertViewsAtNode(parentUUID: string, yysToInstert: GMResourcePlus[]) {
		const thisNode = this.searchViewsForUUID(parentUUID);
		if (!thisNode || thisNode.modelName != "GMLFolder") return;

		// Update our Internally held model of the views:
		const ourStringChildren: string[] = [];

		for (const thisView of yysToInstert) {
			thisNode.children.push(thisView);
			ourStringChildren.push(thisView.id);
		}

		// Create our dummy YY which we'll save to disk:
		const ourYY: Resource.GMFolder = {
			children: ourStringChildren,
			filterType: thisNode.filterType,
			folderName: thisNode.folderName,
			id: thisNode.id,
			isDefaultView: thisNode.isDefaultView,
			localisedFolderName: thisNode.localisedFolderName,
			modelName: "GMFolder",
			mvc: thisNode.mvc,
			name: thisNode.name
		};

		// Save it to disk:
		const fpath = path.join(this.projectDirectory, "views", ourYY.id + ".yy");
		try {
			await fse.writeFile(fpath, JSON.stringify(ourYY, null, 4));
		} catch (err) {
			console.log("Failed to write to file at: " + fpath);
		}
	}

	private viewsFindDefaultViewFolders(viewType: string): GMLFolder | Resource.GMFolder | null {
		const checkArray = [
			"sprites",
			"sounds",
			"paths",
			"scripts",
			"shaders",
			"fonts",
			"timelines",
			"objects",
			"rooms",
			"notes",
			"extensions",
			"options",
			"tilesets",
			"datafiles",
			"configs"
		];

		if (checkArray.includes(viewType) == false) {
			return null;
		}

		// Find our view by Iterating on our default view:
		for (const thisChildView of this.views[this.defaultView].children) {
			if (
				(thisChildView.modelName == "GMLFolder" || thisChildView.modelName == "GMFolder") &&
				thisChildView.folderName == viewType
			) {
				return thisChildView;
			}
		}

		return null;
	}

	private searchViewsForUUID(targetNodeUUID: string, thisNode?: GMResourcePlus): GMResourcePlus | null {
		// Default Node:
		thisNode = thisNode || this.views[this.defaultView];

		if (thisNode.id == targetNodeUUID) {
			return thisNode;
		} else if (thisNode.modelName == "GMLFolder" && thisNode.children != null) {
			let result = null;

			for (let i = 0, l = thisNode.children.length; result == null && i < l; i++) {
				const thisChildNode = thisNode.children[i];
				result = this.searchViewsForUUID(targetNodeUUID, thisChildNode);
			}
			return result;
		}
		return null;
	}

	private constructGMLFolderFromGMFolder(init: Resource.GMFolder): GMLFolder {
		return {
			name: init.name,
			mvc: init.mvc,
			modelName: "GMLFolder",
			localisedFolderName: init.localisedFolderName,
			isDefaultView: init.isDefaultView,
			id: init.id,
			folderName: init.folderName,
			filterType: init.filterType,
			children: []
		};
	}

	private makePrettyFileNames(fn: string): string {
		// Special Case:
		switch (fn) {
			case "tilesets":
				return "Tile Sets";
			case "datafiles":
				return "Included Files";
			case "configs":
				return "Configurations";
		}

		// Other Basic Folder Names:
		const checkArray = [
			"sprites",
			"sounds",
			"paths",
			"scripts",
			"shaders",
			"fonts",
			"timelines",
			"objects",
			"rooms",
			"notes",
			"extensions",
			"options"
		];
		if (checkArray.includes(fn)) {
			return fn.charAt(0).toUpperCase() + fn.slice(1);
		}

		// return all others:
		return fn;
	}
	//#endregion

	//#region Caching
	/**
	 * Run our initial cache check. If the cache exists, it will
	 * save the file names; otherwise, it will create the cache.
	 */
	private async initCheckCache() {
		// Try to Read the Cache
		if (this.topLevelDirectories.includes(".gml-tools")) {
			return await fse.readdir(path.join(this.projectDirectory, ".gml-tools"));
		} else {
			// Create the Cache:
			await this.createCache(path.join(this.projectDirectory, ".gml-tools"));
			return [];
		}
	}

	/**
	 * Creates the .gml-tools folder, where we will cache all
	 * our data.
	 * @param fpath The absolute file path where the manual
	 * should be cached.
	 */
	private async createCache(fpath: string) {
		await fse.mkdir(fpath);
	}

	/**
	 * Checks if the manual is cached or not. It
	 * is safe to run without knowing if the cache
	 * exists yet.
	 * @param fileName The name and extension of the file to
	 * check for. Example: "gmlDocs.json"
	 */
	public async isFileCached(fileName: string): Promise<boolean> {
		// Make sure our Cache is initialized:
		if (!this.cachedFileNames) {
			this.cachedFileNames = await this.initCheckCache();
		}

		return this.cachedFileNames.includes(fileName);
	}

	/**
	 * Returns the text of a file in the `.gml-tools` cache.
	 * Note: this function **is not** safe to run. Use
	 * `isFileCached` first if you will recreate the file.
	 * @param fileName The name of the cached file. No need
	 * for an absolute filepath, since the cache could be
	 * located somewhere only the FileSystem knows.
	 */
	public async getCachedFileText(fileName: string, encoding: string) {
		return await fse.readFile(path.join(this.projectDirectory, ".gml-tools", fileName), encoding);
	}

	/**
	 * Set cached file with a string. Will write over any other data.
	 * @param fileName Filename to create.
	 * @param textToSave Text to save, encoded as 'utf8'
	 */
	public async setCachedFileText(fileName: string, textToSave: string) {
		await fse.writeFile(path.join(this.projectDirectory, ".gml-tools", fileName), textToSave, "utf8");
	}

	public async deletedCachedFile(fileName: string) {
		await fse.unlink(path.join(this.projectDirectory, ".gml-tools", fileName));
	}

	public async deleteCache() {
		await fse.rmdir(path.join(this.projectDirectory, ".gml-tools"));
	}

	public async initProjDocs(dirname: string) {
		// Create the Actual File:
		this.setCachedFileText(
			"project-documentation.json",
			JSON.stringify(
				{
					$schema: URI.file(
						path.join(dirname, path.normalize("../lib/schema/gmlDocsSchema.json"))
					).toString(),
					functions: [],
					instanceVariables: [],
					objectsAndInstanceVariables: []
				},
				null,
				4
			)
		);
	}

	public async installProjectDocWatcher(dirname: string) {
		// Add our File Watcher:
		const fpath = path.join(this.projectDirectory, ".gml-tools", "project-documentation.json");
		const ourDocsWatch = chokidar.watch(fpath);

		// Creat our JSON validator:
		const ajv = new Ajv();
		// On Mac and Linux, ajv has the schema for draft 6, and on Windows, it doesn't.
		// Very strange behavior.
		let check;
		try {
			check = ajv.getSchema("http://json-schema.org/draft-06/schema");
		} catch (error) {}
		if (!check) {
			ajv.addMetaSchema(require("ajv/lib/refs/json-schema-draft-06.json"));
		}
		const schemaPath = path.join(dirname, path.normalize("../lib/schema/gmlDocsSchema.json"));
		const validator = ajv.compile(JSON.parse(await fse.readFile(schemaPath, "utf-8")));

		// Add in one change:
		let ourJSON: any;
		try {
			ourJSON = JSON.parse(await fse.readFile(fpath, "utf8"));
		} catch (err) {
			console.log(err);
		}
		const isValid = await validator(ourJSON);

		if (!isValid) return;
		this.reference.docsClearSecondaryDocs();
		this.reference.docsAddSecondaryDocs(ourJSON);

		ourDocsWatch.on("all", async (someEvent, somePath, someStats) => {
			switch (someEvent) {
				case "change":
					let ourJSON: any;
					try {
						ourJSON = JSON.parse(await fse.readFile(somePath, "utf8"));
					} catch (err) {
						console.log(err);
						break;
					}
					const isValid = await validator(ourJSON);

					if (!isValid) return;
					this.reference.docsClearSecondaryDocs();
					this.reference.docsAddSecondaryDocs(ourJSON);
					break;

				default:
					console.log("Altered docs...");
					break;
			}
		});
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

		// let finalDiagnosticPackage: Diagnostic[] = [];
		try {
			await this.lsp.lint(thisDiagnostic, semanticsToRun);
		} catch (error) {
			console.log("Error at " + fpath + ". Error: " + error);
		}

		// Note: we calculate project diagnostics, but we do not currently send them anywhere. That will
		// be a future option. TODO.
		// await this.lsp.connection.sendDiagnostics(
		// 	DiagnosticsPackage.create(fileURI.toString(), finalDiagnosticPackage)
		// );
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

	private async createDocumentFolder(path: string, name: string, type: ResourceType, eventEntry?: EventInfo) {
		let uri = URI.file(path).toString();

		const thisDocFolder: DocumentFolder = {
			name: name,
			type: type,
			file: ""
		};

		if (eventEntry) {
			thisDocFolder.eventInfo = eventEntry;
		}

		this.documents[uri] = thisDocFolder;
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
		}

		this.openedDocuments.splice(indexNumber, 1);
	}

	//#endregion

	//#region Create Resources
	public async createScript(scriptName: string, createAtNode?: GMResourcePlus | null): Promise<string | null> {
		// Get parent View
		createAtNode = createAtNode || this.viewsFindDefaultViewFolders("scripts");
		if (!createAtNode) return null;

		// Kill without YYP
		if (!this.projectYYP) return null;

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
			SemanticsOption.Function | SemanticsOption.Variable | SemanticsOption.JavaDoc
		);
		this.reference.addResource(newScript.name);

		this.scripts[scriptName] = {
			yyFile: newScript,
			gmlFile: ourGMLPath,
			directoryFilepath: ourDirectoryPath
		};

		// Update Views:
		this.viewsInsertViewsAtNode(createAtNode.id, [newScript]);

		await this.lsp.openTextDocument({
			textDocument: {
				languageId: "gml",
				text: "",
				uri: URI.file(ourGMLPath).toString(),
				version: 1
			}
		});

		return ourGMLPath;
	}

	public async createObject(
		objPackage: CreateObjPackage,
		createAtNode?: GMResourcePlus | null
	): Promise<string | null> {
		// Get parent View
		createAtNode = createAtNode || this.viewsFindDefaultViewFolders("objects");
		if (!createAtNode) return null;

		// Kill without YYP
		if (!this.projectYYP) return null;
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
		let openEditorHere = "";
		let internalEventModel: EventInfo[] = [];
		for (const thisEvent of newObject.eventList) {
			const thisFP = this.convertEventEnumToFPath(thisEvent, ourDirectoryPath);

			if (!openEditorHere) {
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

		// Add to our Views:
		this.viewsInsertViewsAtNode(createAtNode.id, [newObject]);

		return openEditorHere;
	}

	public async addEvents(pack: AddEventsPackage) {
		// Grab our object's file:
		const objInfo = await this.getDocumentFolder(pack.uri);
		if (!objInfo || objInfo.type !== ResourceType.Object) {
			return "";
		}
		const thisObj = this.objects[objInfo.name];

		// This is how we get a return path to go to:
		let returnPath: string = "";

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

	private async createEvent(eventName: string, ownerUUID: string): Promise<Resource.ObjectEvent | null> {
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

	public async createView(fName: string, parentUUID?: string) {
		parentUUID = parentUUID || this.views[this.defaultView].id;

		// Get our Parent so we can get a FilterType:
		const thisParentNode = this.searchViewsForUUID(parentUUID);
		if (!thisParentNode || thisParentNode.modelName != "GMLFolder") return null;
		const newFilterType = thisParentNode.filterType == "root" ? "" : thisParentNode.filterType;

		// Get our ID:
		const ourUUID = uuidv4();

		// Create *this* view first:
		const ourNewView: Resource.GMFolder = {
			children: [],
			filterType: newFilterType,
			folderName: fName,
			id: ourUUID,
			isDefaultView: false,
			localisedFolderName: "",
			mvc: "1.1",
			modelName: "GMFolder",
			name: ourUUID
		};

		// Create view file:
		const fp = path.join(this.projectDirectory, "views", ourNewView.id + ".yy");
		try {
			await fse.writeFile(fp, JSON.stringify(ourNewView, null, 4));
		} catch (err) {
			console.log("View '" + ourNewView.folderName + "' not created.");
			console.log(err);
			return null;
		}

		return ourNewView;
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
		return "";
	}

	private convertEventEnumToName(thisEvent: Resource.ObjectEvent): string {
		switch (thisEvent.eventtype) {
			case EventType.Alarm:
				return "Alarm " + thisEvent.enumb;
			case EventType.CleanUp:
				return "Clean Up";
			case EventType.Collision:
				const ourCollidingObject = this.projectResourceList[thisEvent.collisionObjectId];
				return "Collision -- " + ourCollidingObject.name;
			case EventType.Create:
				return "Create";
			case EventType.Destroy:
				return "Destroy";
			case EventType.Draw:
				switch (thisEvent.enumb) {
					case EventNumber.DrawNormal:
						return "Draw";
					case EventNumber.Gui:
						return "Draw GUI";
					case EventNumber.DrawBegin:
						return "Draw Begin";
					case EventNumber.DrawEnd:
						return "Draw End";
					case EventNumber.GuiBegin:
						return "Draw GUI Begin";
					case EventNumber.GuiEnd:
						return "Draw GUI End";
					case EventNumber.DrawPre:
						return "Pre-Draw";
					case EventNumber.DrawPost:
						return "Post-Draw";
					case EventNumber.WindowResize:
						return "Window Resize";
					default:
						return "";
				}
			case EventType.Gesture:
				return "Gesture Event " + thisEvent.enumb;
			case EventType.Keyboard:
				return "Key Down Event " + thisEvent.enumb;
			case EventType.KeyPress:
				return "Key Press Event " + thisEvent.enumb;
			case EventType.KeyRelease:
				return "Key Up Event " + thisEvent.enumb;
			case EventType.Mouse:
				return "Mouse Event " + thisEvent.enumb;
			case EventType.Other:
				// User Events
				if (thisEvent.enumb >= EventNumber.User0 && thisEvent.enumb <= EventNumber.User15) {
					return "User Event " + (thisEvent.enumb - 10);
				}

				// Async
				switch (thisEvent.enumb) {
					case EventNumber.AsyncAudioPlayBack:
						return "Async - Audio Playback";
					case EventNumber.AsyncAudioRecording:
						return "Async - Audio Recording";
					case EventNumber.AsyncCloud:
						return "Async - Cloud";
					case EventNumber.AsyncDialog:
						return "Async - Dialog";
					case EventNumber.AsyncHTTP:
						return "Async - HTTP";
					case EventNumber.AsyncImageLoaded:
						return "Async - Image Loaded";
					case EventNumber.AsyncInAppPurchase:
						return "Async - In-App Purchase";
					case EventNumber.AsyncNetworking:
						return "Async - Networking";
					case EventNumber.AsyncPushNotification:
						return "Async - Push Notification";
					case EventNumber.AsyncSaveLoad:
						return "Async - Save/Load";
					case EventNumber.AsyncSocial:
						return "Async - Social";
					case EventNumber.AsyncSteam:
						return "Async - Steam";
					case EventNumber.AsyncSystem:
						return "Async - System";
				}
				return "Other Event " + thisEvent.enumb;

			case EventType.Step:
				switch (thisEvent.enumb) {
					case EventNumber.StepBegin:
						return "Begin Step";
					case EventNumber.StepEnd:
						return "End Step";
					case EventNumber.StepNormal:
						return "Step";
				}
				return "";
			case EventType.Trigger:
				return "Trigger Event " + thisEvent.enumb;
		}
	}

	private convertStringToEventType(evName: string): EventKinds | null {
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

	private createFPFromBase(thisResource: GMResourcePlus) {
		const resourcePath = this.modelNameToFileName(thisResource.modelName);

		let relativePath;
		// Early exit for silly views and notes, which don't have individual folders
		// because Mark Alexander hates me (I blame him for this too).
		if (resourcePath == "views") {
			relativePath = path.join(resourcePath, thisResource.name + ".yy");
		}

		// Handle Notes
		else if (resourcePath == "notes") {
			relativePath = path.join(resourcePath, thisResource.name + ".txt");
		}

		// Now we do normal execution for everyone else:
		else relativePath = path.join(resourcePath, thisResource.name);

		return path.join(this.projectDirectory, relativePath);
	}

	private modelNameToFileName(mName: string): ResourceNames {
		const ourMap: { [somestring: string]: ResourceNames } = {
			GMObject: "objects",
			GMRoom: "rooms",
			GMSprite: "sprites",
			GMSound: "sounds",
			GMPath: "paths",
			GMFolder: "views",
			GMLFolder: "views",
			GMScript: "scripts",
			GMFont: "fonts",
			GMTimeline: "timelines",
			GMTileSet: "tilesets",
			GMNotes: "notes",
			GMExtension: "extensions",
			GMShader: "shaders",
			GMIncludedFile: "datafiles_yy"
		};

		return ourMap[mName];
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
		if (!this.projectYYP) return;
		switch (eventKind) {
			case "change":
				let newYYP: YYP = JSON.parse(await fse.readFile(ourPath, "utf8"));
				let newResources: Array<YYPResource> = [];
				let deletedResources: Array<YYPResource> = [];
				let keysExisting: Array<string> = [];

				//TODO ADD POLLING INSTEAD OF A TIMEOUT
				const timeout = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
