import { Range, Location, FoldingRangeKind } from "vscode-languageserver/lib/main";
import { JSDOC, FileSystem } from "./fileSystem";
import { VariablesPackage, GMLVarParse, GMLLocalVarParse } from "./diagnostic";
import URI from "vscode-uri/lib/umd";
import { GMLDocs, LanguageService, ResourceType } from "./declarations";
import { FoldingRange } from "vscode-languageserver-protocol/lib/protocol.foldingRange";
import { LangServ } from "./langserv";
import { EventType, EventNumber } from "yyp-typings";

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
	indexOfOrigin: number;
}

export interface IVariable extends GenericResourceModel {
	origin: IVariableOrigin;
}

export interface IVariableOrigin extends GenericOriginInformation {
	varRank: VariableRank;
	isSelf: boolean;
}
export interface IMacro extends GenericResourceModel {
	origin: IMacroOrigin
}

export interface IMacroOrigin extends GenericOriginInformation {
	value: string
}

export enum VariableRank {
	Create,
	BegStep,
	Step,
	EndStep,
	Other,
	Num
}

export interface IEnums {
	[thisURI: string]: URIEnums;
}

export interface URIEnums {
	[thisEnum: string]: IEnum;
}

export interface IEnum {
	location: Location;
	enumEntries: Array<EnumMembers>;
}

export interface GenericValueLocation {
	location: Location;
	value: string;
}

export interface IMacros {
	[thisMacroName: string]: GenericValueLocation;
}

export interface EnumMembers {
	enumName: string;
	enumeration: number;
}

export interface enum2uri {
	[thisEnumName: string]: string;
}


export interface URIRecord {
	index: number;
	name: string;
}

export interface InstVarRecord extends URIRecord {
	object: string;
	isOrigin: boolean;
}

export interface IURIDictionary {
	[thisURI: string]: IURIRecord;
}

export interface IURIRecord {
	localVariables: { [name: string]: IVariable };
	instanceVariables: InstVarRecord[];
	scriptsAndFunctions: URIRecord[];
	foldingRanges: FoldingRange[];
	macros: URIRecord[];
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
	private enums: IEnums;
	private enum2URI: enum2uri;
	private macros: { [name: string]: IMacro };
	private sprites: Array<string>;
	private allResourceNames: Array<string>;
	private URIRecord: IURIDictionary;
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
		this.enum2URI = {};
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
		this.enum2URI = {};
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
			scriptsAndFunctions: []
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
	public localAddVariables(uri: string, locals: GMLLocalVarParse[]) {
		// check if we have a URI dictionary at all:
		if (this.URIRecord[uri] === undefined) {
			this.createURIDictEntry(uri);
		}

		// Clear our locals:
		this.URIRecord[uri].localVariables = {};

		for (const thisLocal of locals) {
			// Slice off the first two, since we add "*." to locals.
			const thisName = thisLocal.name.slice(2);

			// Create a new Entry if we have a var declaration:
			if (thisLocal.isOrigin) {
				this.URIRecord[uri].localVariables[thisName] = {
					origin: {
						indexOfOrigin: 0,
						isSelf: true,
						varRank: 0
					},
					referenceLocations: [Location.create(uri, thisLocal.range)]
				};
			} else {
				this.URIRecord[uri].localVariables[thisName].referenceLocations.push(
					Location.create(uri, thisLocal.range)
				);
			}
		}
	}

	public getAllLocalsAtURI(uri: string) {
		if (this.URIRecord[uri] !== undefined) {
			return Object.getOwnPropertyNames(this.URIRecord[uri].localVariables);
		} else return null;
	}

	public localExists(uri: string, name: string) {
		if (this.URIRecord[uri] && this.URIRecord[uri].localVariables[name] !== undefined) {
			return true;
		} else return false;
	}

	public localGetDeclaration(uri: string, name: string) {
		const varModel = this.URIRecord[uri].localVariables[name];
		return varModel.referenceLocations[varModel.origin.indexOfOrigin];
	}

	public localGetAllReferences(uri: string, name: string) {
		return this.URIRecord[uri].localVariables[name].referenceLocations;
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
		})

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
			scriptPack.referenceLocations.splice(thisScriptIndex.index, 1);
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
		if (scriptPack) {
			return scriptPack.referenceLocations;
		} else {
			return null;
		}
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

	private varGetOriginVar(objName: string, varName: string): IVariableOrigin | null {
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
				this.objects[thisOldVar.object][thisOldVar.name].referenceLocations.splice(thisOldVar.index, 1);

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

	private async varsAssignNewOrigin(referenceArray: Location[], uri: string): Promise<IVariableOrigin | null> {
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

	public getObjectVariablePackage(objName: string, variableName: string) {
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
	public getEnumEntries(enumName: string): Array<EnumMembers> {
		const thisUri = this.enum2URI[enumName];

		return this.enums[thisUri][enumName].enumEntries;
	}

	public getEnumLocation(enumName: string): Location {
		const thisUri = this.enum2URI[enumName];

		return this.enums[thisUri][enumName].location;
	}

	public enumExists(name: string) {
		return !(this.enum2URI[name] == undefined);
	}

	public addEnum(name: string, thisRange: Range, thisURI: string) {
		// Add our URI if it's not there:
		if (this.enums[thisURI] == undefined) {
			this.enums[thisURI] = {};
		}

		this.enums[thisURI][name] = {
			location: { uri: thisURI, range: thisRange },
			enumEntries: []
		};

		this.enum2URI[name] = thisURI;
	}

	public pushEnumEntry(enumName: string, entryName: string, thisURI: string, thisEnumeration: number) {
		this.enums[thisURI][enumName].enumEntries.push({ enumName: entryName, enumeration: thisEnumeration });
	}

	public getEnumURI(enumName: string) {
		return this.enum2URI[enumName];
	}

	public clearAllEnumsAtURI(URI: string) {
		for (const enumName in this.enums[URI]) {
			if (this.enums[URI].hasOwnProperty(enumName)) {
				// clear the normal list
				delete this.enums[URI][enumName];

				// clear the enum2uri List
				if (this.enum2URI[enumName]) {
					delete this.enum2URI[enumName];
				}
			}
		}

		// clear Enums
		this.enums[URI] = {};
	}

	/**
	 * Removes all enums from the reference model which are in the array
	 * provided.
	 * @param enumArray An array of Enum names to be removed. This also
	 * removes any member of the enum.
	 * @param uri The URI whether the Enums were made. For simplicity,
	 * we do not allow multiple URI's here.
	 */
	public clearTheseEnumsAtThisURI(enumArray: string[], uri: string) {
		if (this.enums[uri]) {
			for (const enumName of enumArray) {
				const enumObject = this.enums[uri][enumName];
				if (enumObject) {
					if (this.enum2URI[enumName]) {
						delete this.enum2URI[enumName];
					}
					delete this.enums[uri][enumName];
				}
			}
		}
	}

	/**
	 * This method returns all of the enums at a documents URI.
	 * It is intended to be called in the Semantics.
	 * @param uri The URI of the document to check.
	 */
	public getAllEnumsAtURI(uri: string): Array<string> {
		if (this.enums[uri]) {
			return Object.keys(this.enums[uri]);
		} else return [];
	}

	public getEnumList() {
		return Object.keys(this.enum2URI);
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
		}

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
		// Store the Macro Reference in the Macro Object
		const ourIndex = this.macros[name].referenceLocations.push(Location.create(thisURI, thisRange)) - 1;

		// Add the Macro Reference to the URIRecord
		this.URIRecord[thisURI].macros.push({
			index: ourIndex,
			name: name
		});
	}

	private macroGetMacroInformation(name: string): IMacro | null {
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

		// Send out the Location
		return macro.referenceLocations[macro.origin.indexOfOrigin];
	}

	public macroExists(name: string) {
		return this.macros.hasOwnProperty(name);
	}

	public macroGetAllReferences(name: string): Location[] | null {
		const macro = this.macroGetMacroInformation(name);
		if (!macro) return null;

		// Send out the References
		return macro.referenceLocations;
	}

	public macroClearMacrosAtURI(uri: string) {
		// Iterate through our URIRecord;
		if (!this.URIRecord[uri]) this.createURIDictEntry(uri);

		for (const thisMacroRecord of this.URIRecord[uri].macros) {
			// Get our Macro Information:
			const macroInfo = this.macroGetMacroInformation(thisMacroRecord.name);
			if (!macroInfo) {
				delete this.macros[name];
				continue;
			}

			// Splice out the old Reference
			macroInfo.referenceLocations.splice(thisMacroRecord.index, 1);
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
}
