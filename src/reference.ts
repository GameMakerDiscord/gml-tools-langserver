import { Range, Location, FoldingRangeKind } from "vscode-languageserver/lib/main";
import { JSDOC } from "./fileSystem";
import { VariablesPackage, GMLVarParse, GMLLocalVarParse } from "./diagnostic";
import URI from "vscode-uri/lib/umd";
import { GMLDocs } from "./declarations";
import { FoldingRange } from "vscode-languageserver-protocol/lib/protocol.foldingRange";

export interface IScriptsAndFunctions {
	[key: string]: IEachScript;
}

export interface IEachScript {
	JSDOC: JSDOC;
	uri?: URI;
	callBackLocation?: number;
	isBritish?: boolean;
}

export interface IObjects {
	[objectName: string]: IVars;
}

export interface IVars {
	[variableName: string]: VariableModel;
}

export interface VariableModel {
	originLocation: IOriginVar;
	referenceLocations: Array<Location>;
}

export interface IOriginVar {
	arrayIndex: number;
	supremacy: VariableRank;
	self: boolean;
}

export enum VariableRank {
	Create,
	BegStep,
	Step,
	EndStep,
	Other
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
	name: string;
	value: string;
}

export interface EnumMembers {
	enumName: string;
	enumeration: number;
}

export interface enum2uri {
	[thisEnumName: string]: string;
}

export interface IURI2ObjVariables {
	[thisUri: string]: Array<IObjVar>;
}

export interface IObjVar {
	object: string;
	variable: string;
}

export interface IURIDictionary {
	[thisURI: string]: URIDictionary;
}

export interface URIDictionary {
	localVariables: GenericValueLocation[];
	foldingRanges: FoldingRange[];
	macros: GenericValueLocation[];
}

interface GMLDocOverrides {
	name: string;
	originalEntry?: IEachScript;
}

export class Reference {
	private objects: IObjects;
	private objectList: Array<string>;
	private scriptsAndFunctions: IScriptsAndFunctions;
	private scriptsAndFunctionsList: Array<string>;
	private globalVariables: IVars;
	private gmlDocs: GMLDocs.DocFile | undefined;
	private enums: IEnums;
	private enum2URI: enum2uri;
	private macros2uri: enum2uri;
	private URI2ObjectVariables: IURI2ObjVariables;
	private sprites: Array<string>;
	private allResourceNames: Array<string>;
	private URIDictionary: IURIDictionary;
	public rooms: string[];
	public tilesets: string[];
	public fonts: string[];
	public extensions: string[];
	public shaders: string[];
	public sounds: string[];
	public timeline: string[];
	public paths: string[];
	private gmlDocOverrides: GMLDocOverrides[];

	constructor() {
		this.objects = {};
		this.objectList = [];
		this.URI2ObjectVariables = {};
		this.scriptsAndFunctions = {};
		this.scriptsAndFunctionsList = [];
		this.globalVariables = {};
		this.enums = {};
		this.enum2URI = {};
		this.macros2uri = {};
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
		this.URIDictionary = {};
		this.gmlDocOverrides = [];
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
		this.URI2ObjectVariables = {};
		this.scriptsAndFunctions = {};
		this.scriptsAndFunctionsList = [];
		this.globalVariables = {};
		this.enums = {};
		this.enum2URI = {};
		this.macros2uri = {};
		this.sprites = [];
		this.allResourceNames = [];
		this.URIDictionary = {};

		if (this.gmlDocs) this.initGMLDocs(this.gmlDocs);
	}

	private createURIDictEntry(uri: string) {
		this.URIDictionary[uri] = {
			localVariables: [],
			foldingRanges: [],
			macros: []
		};
	}
	//#endregion

	//#region Folding Ranges
	public foldingAddFoldingRange(uri: string, thisRange: Range, kind: FoldingRangeKind) {
		if (!this.URIDictionary[uri]) {
			this.createURIDictEntry(uri);
		}

		this.URIDictionary[uri].foldingRanges.push({
			startLine: thisRange.start.line,
			endLine: thisRange.end.line,
			kind: kind
		});
	}

	public foldingClearAllFoldingRange(uri: string) {
		if (this.URIDictionary[uri]) {
			this.URIDictionary[uri].foldingRanges = [];
		}
	}

	public foldingGetFoldingRange(uri: string): FoldingRange[] | null {
		if (!this.URIDictionary[uri]) {
			return null;
		} else {
			return this.URIDictionary[uri].foldingRanges;
		}
	}

	//#endregion

	//#region Local Variables
	public localAddVariables(uri: string, locals: GMLLocalVarParse[]) {
		// check if we have a URI dictionary at all:
		if (this.URIDictionary[uri] === undefined) {
			this.createURIDictEntry(uri);
		}

		// Clear our locals:
		this.URIDictionary[uri].localVariables = [];

		for (const thisThing of locals) {
			this.URIDictionary[uri].localVariables.push({
				value: thisThing.name,
				location: Location.create(uri, thisThing.range),
				name: thisThing.name
			});
		}
	}

	public getAllLocalsAtURI(uri: string) {
		if (this.URIDictionary[uri] !== undefined) {
			return this.URIDictionary[uri].localVariables;
		} else return null;
	}

	public localExists(uri: string, name: string) {
		const allLocals = this.getAllLocalsAtURI(uri);

		let exists = false;

		if (allLocals) {
			for (const thisLocal of allLocals) {
				if (thisLocal.value == name) {
					exists = true;
					break;
				}
			}
		}
		return exists;
	}

	public localGetLocation(uri: string, name: string) {
		const allLocals = this.getAllLocalsAtURI(uri);

		if (allLocals) {
			for (const thisLocal of allLocals) {
				if (thisLocal.value == name) {
					return thisLocal.location;
				}
			}
		}
		return null;
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
			isBritish: doNotAutocomplete
		};
	}

	public scriptAddJSDOC(name: string, jsdoc: JSDOC) {
		this.scriptsAndFunctions[name].JSDOC = jsdoc;
	}

	public scriptGetScriptList() {
		return this.scriptsAndFunctionsList;
	}

	/**
	 * Checks if a script or function exists.
	 *
	 * *Please note:* if a function which is valid is flagged
	 * as not existing, please flag an Issue or a PR at the
	 * Github of the project and it will fixed.
	 * @param name The name of the Script or Function to check.
	 */
	public scriptExists(name: string): Boolean {
		return this.scriptsAndFunctions.hasOwnProperty(name);
	}

	/**
	 * Returns the JSDOC of a script or function. Note: it
	 * does not check if the script or function exists first.
	 * Always call `scriptExists` first.
	 *
	 * *Please note:* if a function which is valid is flagged
	 * as not existing, please flag an Issue or a PR at the
	 * Github of the project and it will fixed.
	 * @param name The name of the Script or Function to check.
	 */
	public scriptGetScriptPackage(name: string): IEachScript {
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
	public addVariablesToObject(obj: string, vars: Array<GMLVarParse>, uri: string) {
		// Create object if necessary
		if (this.objects.hasOwnProperty(obj) == false) {
			this.addObject(obj);
		}

		// Create our URI object/clear it
		this.URI2ObjectVariables[uri] = [];

		// Iterate on the variables
		for (const variable of vars) {
			this.objects[obj][variable.name] = {
				uri: uri,
				range: variable.range
			};

			this.URI2ObjectVariables[uri].push({
				object: obj,
				variable: variable.name
			});
		}
	}

	/**
	 * We add the global to the objects property, and to
	 * the property `globalVariables.` We do this for speed in
	 * language services.
	 * @param objName Object to add/check.
	 * @param globvars The global variable array to add. If none,
	 * pass empty array.
	 */
	public addGlobalVariablesToObject(objName: string, globvars: Array<GMLVarParse>, uri: string) {
		// Create object if necessary
		if (this.objects.hasOwnProperty(objName) == false) {
			this.addObject(objName);
		}

		// Iterate on the variables
		for (const globvar of globvars) {
			// Store the global into the global reference.
			this.globalVariables[globvar.name] = {
				uri: uri,
				range: globvar.range
			};
		}
	}

	/**
	 * Simply does both addVariables and addGlobals at the same time. Prefer
	 * using this for simplicity later.
	 */
	public addAllVariablesToObject(obj: string, uri: string, vars: VariablesPackage) {
		this.addVariablesToObject(obj, vars.variables, uri);
		this.addGlobalVariablesToObject(obj, vars.globalVariables, uri);
	}

	public clearAllVariablesAtURI(uri: string) {
		const ourVariables = this.URI2ObjectVariables[uri];

		if (ourVariables) {
			for (const thisVariable of ourVariables) {
				delete this.objects[thisVariable.object][thisVariable.variable];
			}
			delete this.URI2ObjectVariables[uri];
		}
	}

	/** Returns all variables set/declared at the URI. Note: because of GML syntax,
	 * a variable can have multiple set/declaration lines. */
	public getAllVariablesAtURI(uri: string) {
		return this.URI2ObjectVariables[uri];
	}

	public getObjectVariablePackage(objName: string, variableName: string): IVar | null {
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

	public clearTheseVariablesAtURI(uri: string, ourVars: IObjVar[]) {
		if (ourVars) {
			for (const thisVariable of ourVars) {
				delete this.objects[thisVariable.object][thisVariable.variable];
			}
			delete this.URI2ObjectVariables[uri];
		}
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
	public macrosGetAllMacrosAtURI(uri: string): Array<GenericValueLocation> {
		if (this.URIDictionary[uri]) {
			return this.URIDictionary[uri].macros;
		} else return [];
	}

	public getMacroList(): Array<string> {
		return Object.keys(this.macros2uri);
	}

	public macroAddMacro(name: string, value: string, thisRange: Range, thisURI: string) {
		// Add our URI if it's not there:
		if (this.URIDictionary[thisURI] === undefined) {
			this.createURIDictEntry(thisURI);
		}

		// Commit macro to normal dictionary
		this.URIDictionary[thisURI].macros.push({
			location: {
				uri: thisURI,
				range: thisRange
			},
			value: value,
			name: name
		});

		// Add to helper dictionary
		this.macros2uri[name] = thisURI;
	}

	public macroGetMacroInformation(name: string): GenericValueLocation | null {
		const thisUri = this.macros2uri[name];
		if (!thisUri) return null;

		const theseMacros = this.macrosGetAllMacrosAtURI(thisUri);
		if (!theseMacros) return null;

		// Find our Macro
		for (const thisMacro of theseMacros) {
			if (thisMacro.name == name) {
				return thisMacro;
			}
		}

		return null;
	}

	public macroExists(name: string) {
		return !(this.macros2uri[name] === undefined);
	}

	public macroClearMacrosAtURI(uri: string) {
		// Iterate through the Macro List and delete from helper list
		if (!this.URIDictionary[uri]) return;
		for (const thisMacro of this.URIDictionary[uri].macros) {
			// kill our helper entry
			if (this.macros2uri[thisMacro.name]) {
				delete this.macros2uri[thisMacro.name];
			}
		}
		// Just clear the macro
		this.URIDictionary[uri].macros = [];
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
