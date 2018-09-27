import { Range, Location, FoldingRangeKind } from "vscode-languageserver/lib/main";
import { JSDOC, FileSystem } from "./fileSystem";
import { VariablesPackage, GMLVarParse, GMLLocalVarParse } from "./diagnostic";
import URI from "vscode-uri/lib/umd";
import { GMLDocs, LanguageService, ResourceType } from "./declarations";
import { FoldingRange } from "vscode-languageserver-protocol/lib/protocol.foldingRange";
import { LangServ } from "./langserv";
import { EventType, EventNumber } from "yyp-typings";
import { cleanArray, cleanArrayLength } from "./utils";

export interface IScriptsAndFunctions {
	[key: string]: IEachScript;
}

export interface IEachScript {
	JSDOC: JSDOC;
	uri?: URI;
	callBackLocation?: number;
	isBritish?: boolean;
	referenceLocations: Array<Location>;
}

export interface IObjects {
	[objectName: string]: IVars;
}

export interface IVars {
	[variableName: string]: IVariable;
}

export interface GenericResourceModel {
	origin: GenericOriginInformation;
	referenceLocations: Array<Location>;
}

export interface GenericOriginInformation {
	/**
	 * The index of origin refers to the index in the
	 * `referenceLocations` array in a GenericResourceModel.
	 */
	indexOfOrigin: number | null;
}

export interface IVariable extends GenericResourceModel {
	origin: IOriginVar;
}

export interface IOriginVar extends GenericOriginInformation {
	indexOfOrigin: number;
	varRank: VariableRank;
	isSelf: boolean;
}

export interface IMacro extends GenericResourceModel {
	origin: IMacroOrigin;
}

export interface IMacroOrigin extends GenericOriginInformation {
	value: string;
}

interface IEnum extends GenericResourceModel {
	origin: IEnumOrigin;
}

interface IEnumOrigin extends GenericOriginInformation {
	enumMembers: { [name: string]: IEnumMembers };
}

interface IEnumMembers extends GenericResourceModel {
	value: string;
}

export enum VariableRank {
	Create,
	BegStep,
	Step,
	EndStep,
	Other,
	Num
}

export interface URIRecord {
	index: number;
	name: string;
}

export interface InstVarRecord extends URIRecord {
	object: string;
	isOrigin: boolean;
}

export interface EnumMemberRecord extends URIRecord {
	/** This is the name of the Enum like ENUM in "ENUM.member" */
	enumName: string;

	/** This is the name of the enum member like MEMBER in "enum.MEMBER" */
	name: string;
}

export interface IURIRecord {
	localVariables: { [name: string]: GenericResourceModel };
	instanceVariables: InstVarRecord[];
	scriptsAndFunctions: URIRecord[];
	foldingRanges: FoldingRange[];
	macros: URIRecord[];
	enums: URIRecord[];
	enumMembers: EnumMemberRecord[];
}

interface GMLDocOverrides {
	name: string;
	originalEntry?: IEachScript;
}

export class Reference {
	private lsp: LangServ;
	private objects: IObjects;
	private objectList: Array<string>;
	private scriptsAndFunctions: IScriptsAndFunctions;
	private scriptsAndFunctionsList: Array<string>;
	private globalVariables: IVars;
	private gmlDocs: GMLDocs.DocFile | undefined;
	private enums: { [uri: string]: IEnum };
	private macros: { [name: string]: IMacro };
	private sprites: Array<string>;
	private allResourceNames: Array<string>;
	private URIRecord: { [thisUri: string]: IURIRecord };
	public rooms: string[];
	public tilesets: string[];
	public fonts: string[];
	public extensions: string[];
	public shaders: string[];
	public sounds: string[];
	public timeline: string[];
	public paths: string[];
	private gmlDocOverrides: GMLDocOverrides[];

	constructor(lsp: LangServ) {
		this.objects = {};
		this.objectList = [];
		this.scriptsAndFunctions = {};
		this.scriptsAndFunctionsList = [];
		this.globalVariables = {};
		this.enums = {};
		this.macros = {};
		this.sprites = [];
		this.allResourceNames = [];
		this.tilesets = [];
		this.fonts = [];
		this.extensions = [];
		this.shaders = [];
		this.sounds = [];
		this.timeline = [];
		this.paths = [];
		this.rooms = [];
		this.URIRecord = {};
		this.gmlDocOverrides = [];
		this.lsp = lsp;

		// Add our "global" object to the objects:
		this.objects["global"] = {};
	}

	public initGMLDocs(gmlDocs: GMLDocs.DocFile) {
		this.gmlDocs = gmlDocs;
		// Add our docs into our scriptsAndFunctions.
		for (const thisFunction of this.gmlDocs.functions) {
			let jsdoc: JSDOC = {
				signature: thisFunction.signature,
				returns: thisFunction.return,
				maxParameters: thisFunction.maxParameters,
				minParameters: thisFunction.minParameters,
				parameters: thisFunction.parameters,
				description: thisFunction.documentation,
				isScript: false,
				link: thisFunction.link
			};
			// Add to the Reference Chart
			this.scriptAddScript(thisFunction.name, undefined, jsdoc, thisFunction.doNotAutoComplete);
		}
	}

	public docsAddSecondaryDocs(gmlDocs: GMLDocs.DocFile) {
		for (const thisFunction of gmlDocs.functions) {
			// Add to Overrides List:
			if (this.scriptExists(thisFunction.name)) {
				this.gmlDocOverrides.push({
					name: thisFunction.name,
					originalEntry: this.scriptGetScriptPackage(thisFunction.name)
				});

				// Remove its listing from ScriptsAndFunctions:
				const ourIndex = this.scriptsAndFunctionsList.indexOf(thisFunction.name);
				if (ourIndex) {
					this.scriptsAndFunctionsList.splice(ourIndex, 1);
				}
			} else {
				this.gmlDocOverrides.push({
					name: thisFunction.name
				});
			}

			// Add to Normal Script/Function:
			const jsdoc: JSDOC = {
				signature: thisFunction.signature,
				returns: thisFunction.return,
				maxParameters: thisFunction.maxParameters,
				minParameters: thisFunction.minParameters,
				parameters: thisFunction.parameters,
				description: thisFunction.documentation,
				isScript: false,
				link: thisFunction.link
			};
			this.scriptAddScript(thisFunction.name, undefined, jsdoc, thisFunction.doNotAutoComplete);
		}
	}

	public docsClearSecondaryDocs() {
		for (const thisFunctionName of this.gmlDocOverrides) {
			if (thisFunctionName.originalEntry) {
				this.scriptsAndFunctions[thisFunctionName.name] = thisFunctionName.originalEntry;
			} else {
				this.scriptDelete(thisFunctionName.name);
			}
		}

		// clear our list:
		this.gmlDocOverrides = [];
	}

	//#region All Resources
	public addResource(name: string) {
		this.allResourceNames.push(name);
	}

	public deleteResource(name: string) {
		const resourceLocation = this.allResourceNames.indexOf(name);

		if (resourceLocation) {
			this.allResourceNames.splice(resourceLocation, 1);
		}
	}

	public getAllResources(): string[] {
		return this.allResourceNames;
	}

	public resourceExists(name: string): boolean {
		return this.allResourceNames.includes(name);
	}

	public clearAllData() {
		this.objects = {};
		this.objectList = [];
		this.scriptsAndFunctions = {};
		this.scriptsAndFunctionsList = [];
		this.globalVariables = {};
		this.enums = {};
		this.sprites = [];
		this.allResourceNames = [];
		this.URIRecord = {};

		if (this.gmlDocs) this.initGMLDocs(this.gmlDocs);
	}

	private createURIDictEntry(uri: string) {
		this.URIRecord[uri] = {
			localVariables: {},
			foldingRanges: [],
			macros: [],
			instanceVariables: [],
			scriptsAndFunctions: [],
			enums: [],
			enumMembers: []
		};
	}
	//#endregion

	//#region Folding Ranges
	public foldingAddFoldingRange(uri: string, thisRange: Range, kind: FoldingRangeKind) {
		if (!this.URIRecord[uri]) {
			this.createURIDictEntry(uri);
		}

		this.URIRecord[uri].foldingRanges.push({
			startLine: thisRange.start.line,
			endLine: thisRange.end.line,
			kind: kind
		});
	}

	public foldingClearAllFoldingRange(uri: string) {
		if (this.URIRecord[uri]) {
			this.URIRecord[uri].foldingRanges = [];
		}
	}

	public foldingGetFoldingRange(uri: string): FoldingRange[] | null {
		if (!this.URIRecord[uri]) {
			return null;
		} else {
			return this.URIRecord[uri].foldingRanges;
		}
	}

	//#endregion

	//#region Local Variables
	/**
	 * Creates an entry for a Local Variable.
	 * @param localName: The name of the local variable. Do not add "*." to it.
	 * @param thisURI The URI of the document where the reference is found.
	 * @param thisRange The Range of the ENUM only (not the Member)
	 */
	public localCreateLocal(localName: string, thisURI: string, thisRange: Range) {
		// Create our URI Record
		if (!this.URIRecord[thisURI]) this.createURIDictEntry(thisURI);

		// Get our working URI Object
		const localObject = this.URIRecord[thisURI].localVariables;
		const localEntry = this.localGetInformation(localName, thisURI);

		// Check if there's a headless entry around
		// This happens when someone uses a local and declares it later, for
		// which they should be killed.
		if (localEntry !== undefined) {
			// This human sucks.
			const index =
				localEntry.referenceLocations.push({
					range: thisRange,
					uri: thisURI
				}) - 1;

			localEntry.origin = {
				indexOfOrigin: index
			};
			return;
		}

		// If we're here, we're a normal Creation:
		localObject[localName] = {
			origin: {
				indexOfOrigin: 0
			},
			referenceLocations: [Location.create(thisURI, thisRange)]
		};
	}

	public localPushLocalReference(localName: string, thisURI: string, thisRange: Range) {
		// Get our Local Entry
		const localEntry = this.localGetInformation(localName, thisURI);
		if (!localEntry) return;

		// Push ourselves there:
		localEntry.referenceLocations.push(Location.create(thisURI, thisRange));
	}

	/**
	 * Clears all the locals at a given URI.
	 * @param thisURI The URI of the document where the reference is found.
	 */
	public localClearAtllLocsAtURI(uri: string) {
		if (!this.URIRecord[uri]) {
			this.createURIDictEntry(uri);
			return;
		}

		this.URIRecord[uri].localVariables = {};
	}

	public localExists(uri: string, name: string): boolean {
		if (this.URIRecord[uri] && this.URIRecord[uri].localVariables[name] !== undefined) {
			return true;
		} else return false;
	}

	public localGetOrigin(uri: string, name: string): Location | null {
		// Get our Local Info
		const localInfo = this.localGetInformation(name, uri);
		if (!localInfo) return null;

		// Check if we have a local Origin Index
		const origIndex = localInfo.origin.indexOfOrigin;
		if (!origIndex) return null;

		// Return the local origin location
		return localInfo.referenceLocations[origIndex];
	}

	public localGetAllReferences(uri: string, name: string): Location[] | null {
		// Get Local Info
		const localInfo = this.localGetInformation(name, uri);
		if (!localInfo) return null;

		// Send away the locations
		return localInfo.referenceLocations;
	}

	private localGetInformation(localName: string, thisURI: string): GenericResourceModel | undefined {
		return this.URIRecord[thisURI].localVariables[localName];
	}

	public localGetAllLocalsAtURI(uri: string) {
		return Object.getOwnPropertyNames(this.URIRecord[uri].localVariables);
	}

	//#endregion

	//#region Scripts
	public scriptAddScript(name: string, uri?: URI, jsdoc?: JSDOC, doNotAutocomplete?: boolean) {
		this.scriptsAndFunctions[name] = {
			JSDOC: jsdoc || {
				description: "",
				isScript: true,
				minParameters: 0,
				maxParameters: 9999,
				parameters: [],
				returns: "",
				signature: ""
			},
			uri: uri,
			callBackLocation:
				doNotAutocomplete === undefined
					? this.scriptsAndFunctionsList.push(name)
					: doNotAutocomplete === true
						? this.scriptsAndFunctionsList.push(name)
						: -1,
			isBritish: doNotAutocomplete,
			referenceLocations: []
		};
	}

	public scriptAddJSDOC(name: string, jsdoc: JSDOC) {
		this.scriptsAndFunctions[name].JSDOC = jsdoc;
	}

	public scriptGetScriptList() {
		return this.scriptsAndFunctionsList;
	}

	/**
	 * Checks if a script or function exists. Note we don't check
	 * the script list here because that list is for autocomplete.
	 * @param name The name of the Script or Function to check.
	 */
	public scriptExists(name: string): Boolean {
		return this.scriptsAndFunctions.hasOwnProperty(name);
	}

	/**
	 * Returns the JSDOC of a script or function. Note: it
	 * does not check if the script or function exists first.
	 * Always call `scriptExists` first.
	 * @param name The name of the Script or Function to check.
	 */
	public scriptGetScriptPackage(name: string): IEachScript | undefined {
		return this.scriptsAndFunctions[name];
	}

	/**
	 * Deletes a script entirely from the internal model, including
	 * any references to it. It is **not safe** to use without checking
	 * that the script exists first.
	 * @param name This is the script to the delete.
	 */
	public scriptDelete(name: string) {
		if (this.scriptsAndFunctions[name].callBackLocation && this.scriptsAndFunctions[name].callBackLocation !== -1) {
			const ourIndex = this.scriptsAndFunctionsList.indexOf(name);
			this.scriptsAndFunctionsList.splice(ourIndex, 1);
		}

		delete this.scriptsAndFunctions[name];
	}

	/**
	 * Adds a script reference unsafely (must run scriptExists first) and
	 * adds to the URI record for the script.
	 */
	public scriptAddReference(name: string, uri: string, range: Range) {
		// Add to the script object
		const i = this.scriptsAndFunctions[name].referenceLocations.push(Location.create(uri, range)) - 1;

		// Create the Record Object if it doesn't exist
		if (!this.URIRecord[uri]) this.createURIDictEntry(uri);

		this.URIRecord[uri].scriptsAndFunctions.push({
			index: i,
			name: name
		});
	}

	/**
	 * Removes all references to a script unsafely (run scriptExists first) at
	 * a given URI.
	 */
	public scriptRemoveAllReferencesAtURI(uri: string) {
		if (!this.URIRecord[uri]) this.createURIDictEntry(uri);

		for (const thisScriptIndex of this.URIRecord[uri].scriptsAndFunctions) {
			// Get our Script Pack
			const scriptPack = this.scriptGetScriptPackage(thisScriptIndex.name);
			if (!scriptPack) return;

			// Splice out the old location:
			delete scriptPack.referenceLocations[thisScriptIndex.index];
		}

		// Clear our Record of Indexes since those indexes have been removed:
		this.URIRecord[uri].scriptsAndFunctions = [];
	}
	/**
	 * Retrieves all references for a given script.
	 * @param scriptName The name of the script to get all reference to.
	 */
	public scriptGetAllReferences(scriptName: string): Location[] | null {
		const scriptPack = this.scriptGetScriptPackage(scriptName);
		if (!scriptPack) return null;

		return cleanArray(scriptPack.referenceLocations);
	}
	//#endregion

	//#region Objects
	public objectGetList() {
		return this.objectList;
	}

	public addObject(objName: string) {
		this.objects[objName] = {};
		this.objectList.push(objName);
	}

	/**
	 * Adds all of the variables in the array to the object
	 * property of `reference`. Used for typing services.
	 * @param obj Object to add/check.
	 * @param vars The variable array to add. If none, pass empty array.
	 */
	public addVariablesToObject(vars: Array<GMLVarParse>, uri: string) {
		// Create our URI object/clear it
		this.URIRecord[uri].instanceVariables = [];

		// Iterate on the variables
		for (const thisVar of vars) {
			// Create object if necessary
			if (this.objects.hasOwnProperty(thisVar.object) == false) {
				this.addObject(thisVar.object);
			}

			// Create Variable location if necessary
			if (this.objects[thisVar.object].hasOwnProperty(thisVar.name) == false) {
				// Extend/Update our internal model
				this.objects[thisVar.object][thisVar.name] = {
					origin: {
						indexOfOrigin: 0,
						isSelf: thisVar.isSelf,
						varRank: thisVar.supremacy
					},
					referenceLocations: [Location.create(uri, thisVar.range)]
				};

				// Create a Record of this Object
				this.URIRecord[uri].instanceVariables.push({
					object: thisVar.object,
					name: thisVar.name,
					index: 0,
					isOrigin: true
				});
			} else {
				// Figure out if this is our Origin Variable
				let overrideOrigin = false;
				const previousOrigin = this.varGetOriginVar(thisVar.object, thisVar.name);
				if (previousOrigin) {
					if (previousOrigin.isSelf == false && thisVar.isSelf == true) {
						overrideOrigin = true;
					} else if (previousOrigin.isSelf == thisVar.isSelf) {
						// Compare their respective events, essentially.
						// Remember, smaller is better!
						if (previousOrigin.varRank > thisVar.supremacy) {
							overrideOrigin = true;
						}
					}
				} else {
					// We the new origin in town boys:
					console.log(
						"ERROR: Floating variable with no Origin set. Origin randomly reapplied. Please post an issue on the Github."
					);
					overrideOrigin = true;
				}

				// Push what we have to the stack no matter what:
				const ourIndex =
					this.objects[thisVar.object][thisVar.name].referenceLocations.push(
						Location.create(uri, thisVar.range)
					) - 1;

				// Override Origin
				if (overrideOrigin) {
					this.objects[thisVar.object][thisVar.name].origin = {
						indexOfOrigin: ourIndex,
						isSelf: thisVar.isSelf,
						varRank: thisVar.supremacy
					};
				}

				// Create our Record
				this.URIRecord[uri].instanceVariables.push({
					object: thisVar.object,
					name: thisVar.name,
					index: ourIndex,
					isOrigin: overrideOrigin
				});
			}
		}
	}

	private varGetOriginVar(objName: string, varName: string): IOriginVar | null {
		if (this.objects[objName] && this.objects[objName][varName]) {
			return this.objects[objName][varName].origin;
		}

		return null;
	}

	/**
	 * Simply does both addVariables and addGlobals at the same time. Prefer
	 * using this for simplicity later.
	 */
	public addAllVariablesToObject(uri: string, vars: VariablesPackage) {
		this.addVariablesToObject(vars.variables, uri);
	}

	public async clearAllVariablesAtURI(uri: string) {
		const ourPreviousVariables = this.URIRecord[uri].instanceVariables;

		if (ourPreviousVariables) {
			for (const thisOldVar of ourPreviousVariables) {
				// Get our Variable Info:
				const thisVarEntry = this.objects[thisOldVar.object][thisOldVar.name];
				if (!thisVarEntry) {
					continue;
				}

				// Splice out the Record from this Var:
				delete this.objects[thisOldVar.object][thisOldVar.name].referenceLocations[thisOldVar.index];

				if (thisOldVar.isOrigin) {
					const newOrigin = await this.varsAssignNewOrigin(thisVarEntry.referenceLocations, uri);
					if (newOrigin === null) {
						// Delete the variable entirely -- we've lost all reference to it.
						delete this.objects[thisOldVar.object][thisOldVar.name];
					} else {
						thisVarEntry.origin = newOrigin;
					}
				}
			}

			this.URIRecord[uri].instanceVariables = [];
		}
	}

	private async varsAssignNewOrigin(referenceArray: Location[], uri: string): Promise<IOriginVar | null> {
		const fsManager: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
		const URIInfo = await fsManager.getDocumentFolder(uri);
		if (!URIInfo) return null;
		const objName = URIInfo.name;

		// Our Dummy "Best Candidate"
		let bestCandidate = {
			arrayIndex: 0,
			isSelf: false,
			varRank: VariableRank.Num,
			location: Location.create("", Range.create(0, 0, 0, 0))
		};
		let dummyURI = "";

		for (let i = 0, l = referenceArray.length; i < l; i++) {
			const thisVar = referenceArray[i];

			const thisURIInfo = await fsManager.getDocumentFolder(thisVar.uri);
			if (!thisURIInfo || !thisURIInfo.eventInfo || thisURIInfo.type !== ResourceType.Object) continue;
			const isSelf = thisURIInfo.name == objName;
			if (bestCandidate.isSelf == true && isSelf == false) continue;

			// Get our Supremacy; (HOLY SHIT THIS IS A RATS NEST. I guess there is such a thing as too many enums)
			let thisRank = VariableRank.Num;
			if (thisURIInfo.eventInfo.eventType == EventType.Create) {
				thisRank = VariableRank.Create;
			} else {
				if (bestCandidate.varRank < VariableRank.BegStep) continue;
				if (thisURIInfo.eventInfo.eventType == EventType.Step) {
					thisRank =
						thisURIInfo.eventInfo.eventNumb === EventNumber.StepBegin
							? VariableRank.BegStep
							: thisURIInfo.eventInfo.eventNumb === EventNumber.StepNormal
								? VariableRank.Step
								: thisURIInfo.eventInfo.eventNumb === EventNumber.StepEnd
									? VariableRank.EndStep
									: VariableRank.Other;
					if (bestCandidate.varRank < thisRank) continue;
				} else {
					thisRank = VariableRank.Other;
					if (bestCandidate.varRank < thisRank) continue;
				}
			}

			// If we've just found a better URI/Var, then we make our leading Candidate
			if (dummyURI === thisVar.uri) {
				// Okay we've got the same URI. We go with the higher line number:
				if (bestCandidate.location.range.start.line > thisVar.range.start.line) continue;
				// If we're equal, literally fuck this dude but I shall support him.
				if (bestCandidate.location.range.start.line == thisVar.range.start.line) {
					if (bestCandidate.location.range.start.character <= thisVar.range.start.line) continue;
				}
			}
			// ReAsign Best Candidate:
			bestCandidate = {
				arrayIndex: i,
				isSelf: isSelf,
				varRank: thisRank,
				location: thisVar
			};
		}

		if (bestCandidate.varRank < VariableRank.Num) {
			return {
				indexOfOrigin: bestCandidate.arrayIndex,
				isSelf: bestCandidate.isSelf,
				varRank: bestCandidate.varRank
			};
		}

		return null;
	}

	/** Returns all variables set/declared at the URI. Note: because of GML syntax,
	 * a variable can have multiple set/declaration lines. */
	public getAllVariablesAtURI(uri: string) {
		return this.URIRecord[uri].instanceVariables;
	}

	public objectGetAllVariableReferences(objName: string, varName: string) {
		const varPackage = this.objectGetVariablePackage(objName, varName);
		if (!varPackage) return null;

		return cleanArray(varPackage.referenceLocations);
	}

	public objectGetOriginLocation(objName: string, varName: string) {
		const varPackage = this.objectGetVariablePackage(objName, varName);
		if (!varPackage) return null;

		return varPackage.referenceLocations[varPackage.origin.indexOfOrigin];
	}

	private objectGetVariablePackage(objName: string, variableName: string) {
		const thisObjVariables = this.objects[objName];

		if (thisObjVariables) {
			if (thisObjVariables[variableName]) {
				return thisObjVariables[variableName];
			}
		}

		return null;
	}

	public objectExists(objName: string) {
		return !(this.objects[objName] == undefined);
	}

	public getAllObjectVariables(objName: string): Array<string> {
		if (this.objects.hasOwnProperty(objName) == false) {
			return [];
		}

		return Object.getOwnPropertyNames(this.objects[objName]);
	}

	public getGlobalVariables() {
		return Object.getOwnPropertyNames(this.globalVariables);
	}

	//#endregion

	//#region Enums
	public enumCreateEnum(name: string, thisRange: Range, thisURI: string) {
		// Create our Entry in the Enum object:
		this.enums[name] = {
			origin: {
				enumMembers: {},
				indexOfOrigin: 0
			},
			referenceLocations: [Location.create(thisURI, thisRange)]
		};

		// Add our URI if it's not there:
		if (this.URIRecord[thisURI] === undefined) {
			this.createURIDictEntry(thisURI);
		}

		// Store this Enum in the URI object:
		this.URIRecord[thisURI].enums.push({
			index: 0,
			name: name
		});
	}

	public enumCreateEnumMember(
		enumName: string,
		entryName: string,
		thisURI: string,
		thisRange: Range,
		thisEnumeration: string
	) {
		// Add the Enum Member to the Object:
		const ourEnum = this.enumGetEnumInformation(enumName);
		if (!ourEnum) {
			console.log("Attempted to add enum member to enum which does not exist. Skipping...");
			return;
		}
		ourEnum.origin.enumMembers[entryName] = {
			origin: {
				indexOfOrigin: 0
			},
			referenceLocations: [Location.create(thisURI, thisRange)],
			value: thisEnumeration
		};

		// Add this Enum to our URI Record:
		this.URIRecord[thisURI].enumMembers.push({
			index: 0,
			name: entryName,
			enumName: enumName
		});
	}

	/**
	 * Pushes a new Enum to the Enum Reference list.
	 * @param enumName The name of the Enum (i.e., the ENUM in ENUM.member).
	 * @param thisURI The URI of the document where the reference is found.
	 * @param thisRange The Range of the ENUM only (not the Member)
	 */
	public enumPushEnumReference(enumName: string, thisURI: string, thisRange: Range) {
		// Find our Enum Object
		const ourEnum = this.enumGetEnumInformation(enumName);
		if (!ourEnum) return;

		// Push to the Enum Object
		const index = ourEnum.referenceLocations.push(Location.create(thisURI, thisRange)) - 1;

		// Push to our Record
		this.URIRecord[thisURI].enums.push({
			index: index,
			name: enumName
		});
	}

	/**
	 * Pushes a new Enum Member to the Enum Member reference list.
	 * @param enumName The name of the Enum (i.e., the ENUM in ENUM.member).
	 * @param enumMemberName The name of the Enum Member (i.e., the MEMBER in enum.MEMBER)
	 * @param thisURI The URI of the document where the reference is found.
	 * @param thisRange The Range of the ENUM only (not the Member)
	 */
	public enumPushEnumMemberReference(enumName: string, enumMemberName: string, thisURI: string, thisRange: Range) {
		// Find our Enum Object
		const enumInfo = this.enumGetEnumInformation(enumName);
		if (!enumInfo) return;

		// Find our Enum Member Object
		const enumMemberInfo = this.enumGetEnumMemberInformation(enumInfo, enumMemberName);
		if (!enumMemberInfo) return;

		// Push to the Enum Member Object
		const index = enumMemberInfo.referenceLocations.push(Location.create(thisURI, thisRange)) - 1;

		// Push to our Record
		this.URIRecord[thisURI].enumMembers.push({
			index: index,
			name: enumMemberName,
			enumName: enumName
		});
	}

	/**
	 * Finds the origin location (i.e. where the enum was declared).
	 * @param enumName The name of the Enum to find the origin location of.
	 */
	public enumGetOriginLocation(enumName: string): Location | null {
		// Get our Info
		const enumInfo = this.enumGetEnumInformation(enumName);
		if (!enumInfo) return null;

		// Return if Origin Exists
		const originLocation = this.genericGetOriginLocation(enumInfo);
		if (!originLocation) return null;

		return originLocation;
	}
	/**
	 * Returns the Origin location of the Enum members (i.e., where the enum and
	 * enum member were declared).
	 * @param enumName The name of the Enum (i.e., the ENUM in ENUM.member).
	 * @param enumMemberName The name of the Enum Member (i.e., the MEMBER in enum.MEMBER)
	 */
	public enumMemberGetOriginLocation(enumName: string, enumMemberName: string): Location | null {
		// Get our Info
		const enumInfo = this.enumGetEnumInformation(enumName);
		if (!enumInfo) return null;

		// Check if we have an enum member
		const enumMemberInfo = this.enumGetEnumMemberInformation(enumInfo, enumMemberName);
		if (!enumMemberInfo) return null;

		// Return the Origin if it exists:
		const originLocation = this.genericGetOriginLocation(enumMemberInfo);
		if (!originLocation) return null;

		return originLocation;
	}

	/**
	 * Returns all the locations where this Enum is logged.
	 * @param enumName The name of the Enum (i.e., the ENUM in ENUM.member)
	 */
	public enumGetAllReferences(enumName: string): Location[] | null {
		// Get our Info
		const enumInfo = this.enumGetEnumInformation(enumName);
		if (!enumInfo) return null;

		// Get the References
		return enumInfo.referenceLocations;
	}

	/**
	 * Returns all the locations where this EnumMember is logged.
	 * @param enumName The name of the Enum (i.e., the ENUM in ENUM.member).
	 * @param enumMemberName The name of the Enum Member (i.e., the MEMBER in enum.MEMBER)
	 */
	public enumMemberGetAllReferences(enumName: string, enumMember: string): Location[] | null {
		// Get our Info
		const enumInfo = this.enumGetEnumInformation(enumName);
		if (!enumInfo) return null;

		// Get Enum Member Info
		const enumMemberInfo = this.enumGetEnumMemberInformation(enumInfo, enumMember);
		if (!enumMemberInfo) return null;

		return enumMemberInfo.referenceLocations;
	}

	/**
	 * Cycles through the URI record and clears all the enum entries out
	 * of the EnumObject
	 * @param uri The uri to clear Enums at.
	 */
	public enumClearAllEnumsAtURI(uri: string) {
		// Iterate through our URIRecord;
		if (!this.URIRecord[uri]) this.createURIDictEntry(uri);

		for (const thisEnumRecord of this.URIRecord[uri].enums) {
			// Get our Macro Information:
			const thisEnum = this.enumGetEnumInformation(thisEnumRecord.name);
			if (!thisEnum) continue;

			// Splice out the old Reference
			delete thisEnum.referenceLocations[thisEnumRecord.index];

			// Did we just kill off the Origin?
			if (thisEnumRecord.index === thisEnum.origin.indexOfOrigin) {
				// Clear the Origin
				delete thisEnum.referenceLocations[thisEnum.origin.indexOfOrigin];

				// Clear the indexOfOrigin to Null:
				thisEnum.origin.indexOfOrigin = null;
			}

			// Find if there are no references left
			if (cleanArrayLength(thisEnum.referenceLocations) == 0) {
				console.log(`Deleting Enum '${thisEnumRecord.name}'. All references have been removed.`);
				delete this.enums[thisEnumRecord.name];
			}
		}

		// Clear our Record of Indexes since those indexes have been removed
		this.URIRecord[uri].enums = [];
	}

	/**
	 * Clears out all the enum Member references at the Given URI, cycling through
	 * the Enum Object.
	 * @param uri The uri to clear Enums at.
	 */
	public enumClearAllEnumMembersAtURI(uri: string) {
		// Iterate through our URIRecord
		if (!this.URIRecord[uri]) this.createURIDictEntry(uri);

		for (const thisEnumMemberRecord of this.URIRecord[uri].enumMembers) {
			// Get our Enum Info:
			const thisEnum = this.enumGetEnumInformation(thisEnumMemberRecord.enumName);
			if (!thisEnum) continue;

			const thisEnumMember = this.enumGetEnumMemberInformation(thisEnum, thisEnumMemberRecord.name);
			if (!thisEnumMember) continue;

			delete thisEnumMember.referenceLocations[thisEnumMemberRecord.index];

			// Did we just delete the Origin?
			if (thisEnumMemberRecord.index === thisEnumMember.origin.indexOfOrigin) {
				// Set the Origin to null
				thisEnumMember.origin.indexOfOrigin = null;
			}

			// Find if there are no references left
			if (cleanArrayLength(thisEnumMember.referenceLocations) == 0) {
				console.log(`Deleting Enum Member ${thisEnumMemberRecord.enumName}.${thisEnumMemberRecord.name}
				All References have been removed.`);
				delete this.enums[thisEnumMemberRecord.enumName].origin.enumMembers[thisEnumMemberRecord.name];
			}
		}

		// Clear our Record of Indexes since those indexes have been removed
		this.URIRecord[uri].enumMembers = [];
	}

	public enumGetEnumList() {
		return Object.getOwnPropertyNames(this.enums);
	}

	public enumGetMemberNames(enumName: string): string[] | null {
		const enumInfo = this.enumGetEnumInformation(enumName);
		if (!enumInfo) return null;

		// Send out the Names of the Members:
		return Object.getOwnPropertyNames(enumInfo.origin.enumMembers);
	}

	private enumGetEnumInformation(enumName: string): IEnum | undefined {
		return this.enums[enumName];
	}

	/**
	 * Gets the enummember object or undefined.
	 * @param enumInfo The Enum parent object. We force you to use
	 * the Enum Parent rather than do it all here so you have to deal
	 * with possible `undefined`.
	 */
	private enumGetEnumMemberInformation(enumInfo: IEnum, enumMemberName: string): IEnumMembers | undefined {
		return enumInfo.origin.enumMembers[enumMemberName];
	}

	//#endregion

	//#region Macros
	public getMacroList(): Array<string> {
		return Object.getOwnPropertyNames(this.macros);
	}

	public macroCreateMacro(name: string, value: string, thisRange: Range, thisURI: string) {
		// Add our URI if it's not there:
		if (this.URIRecord[thisURI] === undefined) {
			this.createURIDictEntry(thisURI);
		}

		// Add this Macro to the Macro Object
		this.macros[name] = {
			origin: {
				indexOfOrigin: 0,
				value: value
			},
			referenceLocations: [Location.create(thisURI, thisRange)]
		};

		// Commit this Macro to the Record Dictionary
		this.URIRecord[thisURI].macros.push({
			name: name,
			index: 0
		});
	}

	/**
	 * Adds the Macro Location as a reference location to the Macro. Unsafe to call
	 * without checking if the Macro exists.
	 */
	public macroAddReference(name: string, thisURI: string, thisRange: Range) {
		// Get our Macro
		const macroInfo = this.macroGetMacroInformation(name);
		if (!macroInfo) return;

		// Store the Macro Reference in the Macro Object
		const ourIndex = macroInfo.referenceLocations.push(Location.create(thisURI, thisRange)) - 1;

		// Add the Macro Reference to the URIRecord
		this.URIRecord[thisURI].macros.push({
			index: ourIndex,
			name: name
		});
	}

	private macroGetMacroInformation(name: string): IMacro | undefined {
		return this.macros[name];
	}

	public macroGetMacroValue(name: string): string | null {
		const ourMacroInfo = this.macroGetMacroInformation(name);

		// Return our Macro Information if it's there to get
		if (ourMacroInfo) {
			return ourMacroInfo.origin.value;
		}

		return null;
	}

	public macroGetOrigin(name: string): Location | null {
		const macro = this.macroGetMacroInformation(name);
		if (!macro) return null;

		// Make sure it exists
		const index = macro.origin.indexOfOrigin;
		if (!index) return null;

		// Send out the Location
		return macro.referenceLocations[index];
	}

	public macroExists(name: string) {
		return this.macros.hasOwnProperty(name);
	}

	public macroGetAllReferences(name: string): Location[] | null {
		const macro = this.macroGetMacroInformation(name);
		if (!macro) return null;

		// Clean the array and send it out
		return cleanArray(macro.referenceLocations);
	}

	public macroClearMacrosAtURI(uri: string) {
		// Iterate through our URIRecord;
		if (!this.URIRecord[uri]) this.createURIDictEntry(uri);

		for (const thisMacroRecord of this.URIRecord[uri].macros) {
			// Get our Macro Information:
			const macroInfo = this.macroGetMacroInformation(thisMacroRecord.name);
			// If we have no macroInformation but still have a record delete this Macro Object entry.
			if (!macroInfo) {
				delete this.macros[name];
				continue;
			}

			// Splice out the old Reference
			delete macroInfo.referenceLocations[thisMacroRecord.index];
		}

		// Clear our Record of Indexes since those indexes have been removed
		this.URIRecord[uri].macros = [];
	}

	//#endregion

	//#region Sprites
	public spriteAddSprite(name: string) {
		this.sprites.push(name);
	}

	public spriteSpriteExists(name: string) {
		return this.sprites.includes(name);
	}

	public spriteDeleteSprite(name: string) {
		const thisIndex = this.sprites.indexOf(name);
		if (thisIndex == -1) return;
		this.sprites.splice(thisIndex, 1);
	}

	public spriteGetAllSprites() {
		return this.sprites;
	}
	//#endregion

	//#region General
	private genericGetOriginLocation(genModel: GenericResourceModel): Location | null {
		// If the index doesn't exist, return null
		if (!genModel.origin.indexOfOrigin) return null;

		return genModel.referenceLocations[genModel.origin.indexOfOrigin];
	}

	//#endregion
}
