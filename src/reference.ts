import { Range, Location, Position } from 'vscode-languageserver/lib/main';
import { GMLVarParse } from './diagnostic';
import {
    GMLDocs,
    LanguageService,
    IObjects,
    IEnum,
    IMacro,
    IURIRecord,
    GenericResourceModel,
    IOriginVar,
    VariableRank,
    IEnumMembers,
    IScript,
    ICallables,
    IFunction,
    IExtension,
    JSDOC
} from './declarations';
import { LangServ } from './langserv';
import { EventType, EventNumber } from 'yyp-typings';
import { cleanArray, cleanArrayLength } from './utils';
import { ProjectCache } from './startAndShutdown';
import { FileSystem } from './fileSystem';

export interface GenericResourceDescription {
    name: string;
    type: BasicResourceType;
}
export declare type BasicResourceType =
    | 'GMObject'
    | 'GMScript'
    | 'GMSprite'
    | 'GMRoom'
    | 'GMTileSet'
    | 'GMFont'
    | 'GMExtension'
    | 'GMShader'
    | 'GMSound'
    | 'GMTimeline'
    | 'GMPath'
    | 'GMNote';

export class Reference {
    private lsp: LangServ;
    private objects: IObjects;
    private objectList: string[];
    private callables: ICallables;
    private gmlDocs: GMLDocs.DocFile | undefined;
    private functionList: string[];
    private enums: { [uri: string]: IEnum };
    private macros: { [name: string]: IMacro };
    private projectResources: GenericResourceDescription[];
    private URIRecord: { [thisUri: string]: IURIRecord };
    private extensionRecord: ProjectCache.IExtensionRecord;

    constructor(lsp: LangServ) {
        this.objects = {};
        this.objectList = [];
        this.callables = {
            scripts: {},
            functions: {},
            extensions: {}
        };
        this.functionList = [];
        this.enums = {};
        this.macros = {};
        this.projectResources = [];
        this.URIRecord = {};
        this.extensionRecord = {};
        this.lsp = lsp;

        // Add our "global" object to the objects:
        this.objects['global'] = {};
    }

    //#region Init
    public initDocs(gmlDocs: GMLDocs.DocFile) {
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
            this.functionAddFunction(thisFunction.name, jsdoc, thisFunction.doNotAutoComplete);

            // Add to our list
            if (thisFunction.doNotAutoComplete === false) {
                this.functionList.push(thisFunction.name);
            }
        }
    }

    public initDocsAddSecondaryDocs(gmlDocs: GMLDocs.DocFile) {
        for (const thisCallable of gmlDocs.functions) {
            const ourJSDOC: JSDOC = {
                signature: thisCallable.signature,
                returns: thisCallable.return,
                maxParameters: thisCallable.maxParameters,
                minParameters: thisCallable.minParameters,
                parameters: thisCallable.parameters,
                description: thisCallable.documentation,
                isScript: false,
                link: thisCallable.link
            };

            // Scripts
            const thisScript = this.scriptGetPackage(thisCallable.name);
            if (thisScript) this.scriptAddJSDOC(thisScript, ourJSDOC);

            // Functions
            const thisFunction = this.functionGetPackage(thisCallable.name);
            if (thisFunction) this.functionOverwriteJSON(thisFunction, ourJSDOC);

            // Extensions
            const thisExtension = this.extensionGetPackage(thisCallable.name);
            if (thisExtension) this.extensionOverwriteJSON(thisExtension, ourJSDOC);
        }
    }

    public docsClearSecondaryDocs() {
        // for (const thisFunctionName of this.gmlDocOverrides) {
        //     if (thisFunctionName.originalEntry) {
        //         this.scriptsAndFunctions[thisFunctionName.name] = thisFunctionName.originalEntry;
        //     } else {
        //         this.scriptDelete(thisFunctionName.name);
        //     }
        // }
        // // clear our list:
        // this.gmlDocOverrides = [];
    }

    public initDumpCachedData(cache: ProjectCache.CachedReferences) {
        // Dump Objects
        for (const thisObjectName in cache.object) {
            if (cache.object.hasOwnProperty(thisObjectName)) {
                const thisObj = cache.object[thisObjectName];
                this.objects[thisObjectName] = thisObj;
                this.objectList.push(thisObjectName);
            }
        }

        // Dump Scripts and Functions
        for (const thisScriptName in cache.callables.scripts) {
            if (cache.callables.scripts.hasOwnProperty(thisScriptName)) {
                const thisScript = cache.callables.scripts[thisScriptName];
                this.callables.scripts[thisScriptName] = thisScript;
            }
        }

        // Enums
        for (const thisEnumName in cache.enums) {
            if (cache.enums.hasOwnProperty(thisEnumName)) {
                const thisEnum = cache.enums[thisEnumName];
                this.enums[thisEnumName] = thisEnum;
            }
        }

        // Macros
        for (const thisMacroName in cache.macros) {
            if (cache.macros.hasOwnProperty(thisMacroName)) {
                const thisMacro = cache.macros[thisMacroName];
                this.macros[thisMacroName] = thisMacro;
            }
        }
    }

    public initDumpCachedURIRecord(cachedRecord: IURIRecord, thisURI: string, thisHash: string) {
        this.URIRecord[thisURI] = cachedRecord;
        this.URIRecord[thisURI].hash = thisHash;
    }

    public async initValidateCache() {
        // Enums
        for (const thisEnumName in this.enums) {
            if (this.enums.hasOwnProperty(thisEnumName)) {
                const thisEnum = this.enums[thisEnumName];
                thisEnum.referenceLocations.map((thisLocation: Location | null, i) => {
                    // Cleave our URI Records
                    if (thisLocation && this.URIRecord[thisLocation.uri] === undefined) {
                        // Are we about to kill off the Origin?
                        if (i === thisEnum.origin.indexOfOrigin) {
                            // Clear the indexOfOrigin to Null:
                            thisEnum.origin.indexOfOrigin = null;
                        }

                        // Splice out the old Reference
                        delete thisEnum.referenceLocations[i];

                        // Kill the Enum if it's empty
                        if (cleanArrayLength(thisEnum.referenceLocations) === 0) {
                            console.log(
                                `Clearing enum from cache '${thisEnumName}'. All references have been removed.`
                            );
                            delete this.enums[thisEnumName];
                        }
                    }
                });

                // Continue if we killed the enum:
                if (!this.enums[thisEnumName]) continue;

                // Loop through EnumMembers
                for (const thisEnumMemberName in thisEnum.origin.enumMembers) {
                    if (thisEnum.origin.enumMembers.hasOwnProperty(thisEnumMemberName)) {
                        const thisEnumMember = thisEnum.origin.enumMembers[thisEnumMemberName];
                        thisEnumMember.referenceLocations.map((thisLocation: Location | null, i) => {
                            // Cleave our URI Records
                            if (thisLocation && this.URIRecord[thisLocation.uri] === undefined) {
                                // Are we about to kill off the Origin?
                                if (i === thisEnumMember.origin.indexOfOrigin) {
                                    // Clear the indexOfOrigin to Null:
                                    thisEnumMember.origin.indexOfOrigin = null;
                                }

                                // Splice out the old Reference
                                delete thisEnum.referenceLocations[i];

                                // Kill it if it's empty
                                if (cleanArrayLength(thisEnumMember.referenceLocations) === 0) {
                                    console.log(
                                        `Clearing enum member from cache '${thisEnumMemberName}'. All references have been removed.`
                                    );
                                    delete this.enums[thisEnumName].origin.enumMembers[thisEnumMemberName];
                                }
                            }
                        });
                    }
                }
            }
        }

        // Macros
        for (const thisMacroName in this.macros) {
            if (this.macros.hasOwnProperty(thisMacroName)) {
                const thisMacro = this.macros[thisMacroName];
                thisMacro.referenceLocations.map((thisLocation: Location | null, i) => {
                    if (thisLocation && this.URIRecord[thisLocation.uri] === undefined) {
                        // Are we about to kill off the Origin?
                        if (i === thisMacro.origin.indexOfOrigin) {
                            // Clear the indexOfOrigin to Null:
                            thisMacro.origin.indexOfOrigin = null;
                        }

                        // Splice out the old Reference
                        delete thisMacro.referenceLocations[i];

                        // Kill the Enum if it's empty
                        if (cleanArrayLength(thisMacro.referenceLocations) === 0) {
                            console.log(
                                `Clearing enum from cache '${thisMacroName}'. All references have been removed.`
                            );
                            delete this.macros[thisMacroName];
                        }
                    }
                });
            }
        }

        // Scripts
        for (const thisScriptName in this.callables.scripts) {
            if (this.callables.scripts.hasOwnProperty(thisScriptName)) {
                const thisScript = this.callables.scripts[thisScriptName];
                if (thisScript.uri && this.URIRecord[thisScript.uri] === undefined) {
                    // Delete the script and clear it from the list
                    delete this.callables.scripts[thisScriptName];
                }
            }
        }

        // Objects
        for (const thisObjectName in this.objects) {
            if (this.objects.hasOwnProperty(thisObjectName)) {
                const thisObject = this.objects[thisObjectName];

                // Each Variable... le sigh
                for (const thisVarName in thisObject) {
                    if (thisObject.hasOwnProperty(thisVarName)) {
                        const thisVar = thisObject[thisVarName];
                        thisVar.referenceLocations.map(async (thisLocation: Location | null, i) => {
                            if (thisLocation && this.URIRecord[thisLocation.uri] === undefined) {
                                // Splice out the Record from this Var:
                                delete this.objects[thisObjectName][thisVarName].referenceLocations[i];

                                if (i === thisVar.origin.indexOfOrigin) {
                                    const newOrigin = await this.instAssignNewOrigin(
                                        thisVar.referenceLocations,
                                        thisObjectName
                                    );
                                    if (newOrigin === null) {
                                        // Delete the variable entirely -- we've lost all reference to it.
                                        delete this.objects[thisObjectName][thisVarName];
                                    } else {
                                        thisVar.origin = newOrigin;
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
    }
    //#endregion

    //#region All Resources
    public addResource(resourceName: string, resourceType: BasicResourceType) {
        this.projectResources.push({
            name: resourceName,
            type: resourceType
        });

        if (resourceType == 'GMObject') {
            this.objectAddObject(resourceName);
        }

        if (resourceType == 'GMScript') {
            this.scriptAddScript(resourceName, '', {
                description: '',
                isScript: true,
                minParameters: 0,
                maxParameters: 9999,
                parameters: [],
                returns: '',
                signature: ''
            });
        }
    }

    public deleteResource(name: string) {
        const resourceLocation = this.projectResources.findIndex(thisResource => {
            return thisResource.name === name;
        });

        if (resourceLocation) {
            this.projectResources.splice(resourceLocation, 1);
        }
    }

    public getAllResources(): string[] {
        const returnable: string[] = [];

        for (const thisResource of this.projectResources) {
            returnable.push(thisResource.name);
        }

        return returnable;
    }

    public getAllResourceOfType(resourceType: BasicResourceType): string[] {
        const returnable: string[] = [];

        for (const thisResource of this.projectResources) {
            if (thisResource.type === resourceType) returnable.push(thisResource.name);
        }

        return returnable;
    }

    public resourceExists(name: string): boolean {
        const resourceExists = this.projectResources.find(thisResource => {
            return thisResource.name === name;
        });

        if (resourceExists) {
            return true;
        } else return false;
    }

    public URIcreateURIDictEntry(thisURI: string) {
        this.URIRecord[thisURI] = {
            localVariables: {},
            foldingRanges: [],
            macros: [],
            instanceVariables: [],
            scripts: [],
            extensions: [],
            functions: [],
            enums: [],
            enumMembers: [],
            implicitThisAtPosition: [],
            hash: ''
        };
        return this.URIRecord[thisURI];
    }

    public URISetHash(thisURI: string, hash: string) {
        const thisURIRecord = this.URIgetURIRecord(thisURI);
        thisURIRecord.hash = hash;
    }

    public URIgetURIRecord(thisURI: string) {
        const ourURIRecord = this.URIRecord[thisURI];
        if (ourURIRecord) {
            return this.URIRecord[thisURI];
        } else return this.URIcreateURIDictEntry(thisURI);
    }

    public async URIRecordClearAtURI(thisURI: string) {
        await this.macroClearMacrosAtURI(thisURI);
        await this.enumClearAllEnumsAtURI(thisURI);
        await this.enumMemberClearAllEnumMembersAtURI(thisURI);
        await this.instClearAllInstAtURI(thisURI);
        await this.localClearAtllLocsAtURI(thisURI);
        await this.implicitClearImplicitAtURI(thisURI);
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
        if (!this.URIRecord[thisURI]) this.URIcreateURIDictEntry(thisURI);

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
    public async localClearAtllLocsAtURI(uri: string) {
        if (!this.URIRecord[uri]) {
            this.URIcreateURIDictEntry(uri);
            return;
        }

        this.URIRecord[uri].localVariables = {};
    }

    public localGetOrigin(uri: string, name: string): Location | null {
        // Get our Local Info
        const localInfo = this.localGetInformation(name, uri);
        if (!localInfo) return null;

        // Check if we have a local Origin Index
        const origIndex = localInfo.origin.indexOfOrigin;
        if (origIndex === null) return null;

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

    //#region Callables

    //#region Scripts
    public scriptAddScript(thisName: string, thisURI: string, jsdoc: JSDOC) {
        // TODO Remove this check if it never procs.
        if (this.scriptExists(thisName)) {
            console.log(`Attempting to add ${thisName}, which is already a script.`);
            return;
        }

        this.callables.scripts[thisName] = {
            JSDOC: jsdoc,
            uri: thisURI,
            referenceLocations: []
        };
    }

    public scriptSetURI(thisName: string, thisURI: string) {
        const thisScript = this.scriptGetPackage(thisName);
        if (thisScript) thisScript.uri = thisURI;
    }

    public scriptAddJSDOC(scriptPack: IScript, jsdoc: JSDOC) {
        scriptPack.JSDOC = jsdoc;
    }

    public scriptGetAllScriptNames() {
        return Object.getOwnPropertyNames(this.callables.scripts);
    }

    /**
     * Checks if a script or function exists. Note we don't check
     * the script list here because that list is for autocomplete.
     * @param thisName The name of the Script or Function to check.
     */
    public scriptExists(thisName: string): Boolean {
        return this.callables.scripts.hasOwnProperty(thisName);
    }

    /**
     * Returns the JSDOC of a script or function. Note: it
     * does not check if the script or function exists first.
     * Always call `scriptExists` first.
     * @param thisName The name of the Script or Function to check.
     */
    public scriptGetPackage(thisName: string): IScript | undefined {
        return this.callables.scripts[thisName];
    }

    /**
     * Deletes a script entirely from the internal model, including
     * any references to it. It is **not safe** to use without checking
     * that the script exists first.
     * @param thisName This is the script to the delete.
     */
    public scriptDelete(thisName: string) {
        // Clean the URI
        this.URIRecordClearAtURI(this.callables.scripts[thisName].uri);

        // Delete the Script itself
        delete this.callables.scripts[thisName];

        // Iterate on the URIRecords. Deleting a script is rare, so this
        // can be a big operation.
        for (const thisRecordName in this.URIRecord) {
            if (this.URIRecord.hasOwnProperty(thisRecordName)) {
                const thisRecord = this.URIRecord[thisRecordName];

                for (let i = 0; i < thisRecord.scripts.length; i++) {
                    const thisScriptRecord = thisRecord.scripts[i];

                    if (thisScriptRecord.name === thisName) {
                        delete thisRecord.scripts[i];
                    }
                }

                // Clean the Array and Return it
                thisRecord.scripts = cleanArray(thisRecord.scripts);
            }
        }
    }

    /**
     * Adds a script reference unsafely (must run scriptExists first) and
     * adds to the URI record for the script.
     */
    public scriptAddReference(thisName: string, thisURI: string, thisRange: Range) {
        // Add to the script object
        const i = this.callables.scripts[thisName].referenceLocations.push(Location.create(thisURI, thisRange)) - 1;

        // Create the Record Object if it doesn't exist
        if (!this.URIRecord[thisURI]) this.URIcreateURIDictEntry(thisURI);

        this.URIRecord[thisURI].scripts.push({
            index: i,
            name: thisName
        });
    }

    /**
     * Removes all references to a script unsafely (run scriptExists first) at
     * a given URI.
     */
    public scriptRemoveAllReferencesAtURI(thisURI: string) {
        if (!this.URIRecord[thisURI]) this.URIcreateURIDictEntry(thisURI);

        for (const thisScriptIndex of this.URIRecord[thisURI].scripts) {
            // Get our Script Pack
            const scriptPack = this.scriptGetPackage(thisScriptIndex.name);
            if (!scriptPack) return;

            // Splice out the old location:
            delete scriptPack.referenceLocations[thisScriptIndex.index];
        }

        // Clear our Record of Indexes since those indexes have been removed:
        this.URIRecord[thisURI].scripts = [];
    }
    /**
     * Retrieves all references for a given script.
     * @param thisScriptName The name of the script to get all reference to.
     */
    public scriptGetAllReferences(thisScriptName: string): Location[] | null {
        const scriptPack = this.scriptGetPackage(thisScriptName);
        if (!scriptPack) return null;

        return cleanArray(scriptPack.referenceLocations);
    }
    //#endregion

    //#region GM Functions
    public functionAddFunction(thisName: string, thisJSDOC: JSDOC, doNotAutoComplete: boolean) {
        this.callables.functions[thisName] = {
            JSDOC: thisJSDOC,
            doNotAutoComplete: doNotAutoComplete,
            referenceLocations: []
        };
    }

    public functionGetPackage(thisName: string): IFunction | undefined {
        return this.callables.functions[thisName];
    }

    public functionOverwriteJSON(thisPack: IFunction, thisJSDOC: JSDOC) {
        thisPack.JSDOC = thisJSDOC;
    }

    public functionGetAllFunctionNames() {
        return this.functionList;
    }

    public functionAddReference(thisName: string, thisURI: string, thisRange: Range) {
        const ourFunction = this.functionGetPackage(thisName);
        if (!ourFunction) return;

        ourFunction.referenceLocations.push(Location.create(thisURI, thisRange));
    }

    public functionRemoveAllReferencesAtURI(thisURI: string) {
        const thisURIRecord = this.URIgetURIRecord(thisURI);

        for (const thisFunctionRecord of thisURIRecord.functions) {
            // Get our Script Pack
            const ourFunctionPack = this.functionGetPackage(thisFunctionRecord.name);
            if (!ourFunctionPack) return;

            // Splice out the old location:
            delete ourFunctionPack.referenceLocations[thisFunctionRecord.index];
        }

        // Clear our Record of Indexes since those indexes have been removed:
        this.URIRecord[thisURI].functions = [];
    }

    public functionGetAllReferences(thisName: string): Location[] | null {
        const ourFunctionPack = this.functionGetPackage(thisName);
        if (!ourFunctionPack) return null;

        return cleanArray(ourFunctionPack.referenceLocations);
    }

    //#region Extensions
    public extensionAddExtension(
        thisName: string,
        thisJSDOC: JSDOC,
        doNotAutoComplete: boolean,
        originLoc: Location,
        extensionName: string,
        extensionFileName: string,
        referenceLocations?: Location[]
    ) {
        if (referenceLocations === undefined) {
            referenceLocations = [];
        }

        this.callables.extensions[thisName] = {
            doNotAutoComplete: doNotAutoComplete,
            JSDOC: thisJSDOC,
            referenceLocations: referenceLocations,
            originLocation: originLoc
        };

        // Add to our Record
        if (!this.extensionRecord[extensionName]) {
            this.extensionRecord[extensionName] = {};
        }
        if (!this.extensionRecord[extensionName][extensionFileName]) {
            this.extensionRecord[extensionName][extensionFileName] = {
                hash: '',
                contributedFunctions: []
            };
        }
        this.extensionRecord[extensionName][extensionFileName].contributedFunctions.push(thisName);
    }

    public extensionRecordSetHash(extensionName: string, extensionFileName: string, hash: string) {
        // Add to our Record
        if (!this.extensionRecord[extensionName]) {
            this.extensionRecord[extensionName] = {};
        }
        if (!this.extensionRecord[extensionName][extensionFileName]) {
            this.extensionRecord[extensionName][extensionFileName] = {
                hash: '',
                contributedFunctions: []
            };
        }
        this.extensionRecord[extensionName][extensionFileName].hash = hash;
    }

    public extensionGetPackage(thisName: string): IExtension | undefined {
        return this.callables.extensions[thisName];
    }

    public extensionOverwriteJSON(thisPack: IExtension, thisJSDOC: JSDOC) {
        thisPack.JSDOC = thisJSDOC;
    }

    public extensionGetAllExtensionNames() {
        return Object.getOwnPropertyNames(this.callables.extensions);
    }

    public extensionAddReference(thisName: string, thisURI: string, thisRange: Range) {
        const ourExtension = this.extensionGetPackage(thisName);
        if (!ourExtension) return;

        ourExtension.referenceLocations.push(Location.create(thisURI, thisRange));
    }

    public extensionRemoveAllReferencesAtURI(thisURI: string) {
        const thisURIRecord = this.URIgetURIRecord(thisURI);

        for (const thisExtensionRecord of thisURIRecord.extensions) {
            // Get our Script Pack
            const ourExtensionPack = this.extensionGetPackage(thisExtensionRecord.name);
            if (!ourExtensionPack) return;

            // Splice out the old location:
            delete ourExtensionPack.referenceLocations[thisExtensionRecord.index];
        }

        // Clear our Record of Indexes since those indexes have been removed:
        this.URIRecord[thisURI].extensions = [];
    }

    public extensionGetAllReferences(thisName: string): Location[] | null {
        const ourExtensionPack = this.extensionGetPackage(thisName);
        if (!ourExtensionPack) return null;

        return cleanArray(ourExtensionPack.referenceLocations);
    }

    //#endregion

    //#endregion

    //#endregion

    //#region ImplicitThis
    public implicitAddImplicitEntry(objName: string, uri: string, pos: Position) {
        this.URIRecord[uri].implicitThisAtPosition.push({
            objName: objName,
            position: pos
        });
    }

    /**
     * This is a very weird function which we only use in one place:
     * to figure out what `other` is in a `with` statement. It is strange!
     * @param uri The URI of the URI record to look at.
     */
    public implicitGetLastImplicit(uri: string) {
        const theseImplicits = this.URIRecord[uri].implicitThisAtPosition;
        const lastImplicit = theseImplicits[theseImplicits.length - 2];

        return lastImplicit.objName;
    }

    public async implicitClearImplicitAtURI(uri: string) {
        this.URIRecord[uri].implicitThisAtPosition = [];
    }

    public implicitGetCurrentImplicitEntry(uri: string, checkPos: Position): string {
        for (let i = 0; i < this.URIRecord[uri].implicitThisAtPosition.length; i++) {
            const thisPosition = this.URIRecord[uri].implicitThisAtPosition[i].position;

            // If we're below
            if (thisPosition.line > checkPos.line) {
                return this.URIRecord[uri].implicitThisAtPosition[i - 1].objName;
            }

            // If we're the same line
            if (thisPosition.line == checkPos.line) {
                if (thisPosition.character > checkPos.character) {
                    return this.URIRecord[uri].implicitThisAtPosition[i - 1].objName;
                }

                // Special check for first line and first character of the document
                if (i == 0 && thisPosition.character == checkPos.character) {
                    return this.URIRecord[uri].implicitThisAtPosition[i].objName;
                }
            }
        }

        // Okay, if we're here, then we're beyond the last entry, so we want the last entry.
        return this.URIRecord[uri].implicitThisAtPosition[this.URIRecord[uri].implicitThisAtPosition.length - 1]
            .objName;
    }

    //#endregion

    //#region Objects
    public objectGetList() {
        return this.objectList;
    }

    public objectAddObject(objName: string): boolean {
        if (this.scriptExists(objName)) return false;
        if (this.objectExists(objName)) return false;

        this.objects[objName] = {};
        this.objectList.push(objName);

        return true;
    }

    /**
     * Adds all of the variables in the array to the object
     * property of `reference`. Used for typing services.
     * @param var Object to add/check.
     * @param vars The variable array to add. If none, pass empty array.
     */
    public instAddInstToObject(thisVar: GMLVarParse, uri: string) {
        // Exit if we don't have an object!
        if (this.objects.hasOwnProperty(thisVar.object) == false) {
            return;
        }

        // Create Variable location if necessary
        if (this.objects[thisVar.object].hasOwnProperty(thisVar.name) === false) {
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
            const previousOrigin = this.instGetOriginInst(thisVar.object, thisVar.name);
            if (previousOrigin) {
                if (previousOrigin.isSelf === false && thisVar.isSelf === true) {
                    overrideOrigin = true;
                } else if (previousOrigin.isSelf === thisVar.isSelf) {
                    // Compare their respective events, essentially.
                    // Remember, smaller is better! We done care about equality,
                    // since equality means the former (higher up) stays.
                    if (previousOrigin.varRank > thisVar.supremacy) {
                        overrideOrigin = true;
                    }
                }
            } else {
                // We the new origin in town boys:
                console.log(
                    'ERROR: Floating variable with no Origin set. Origin randomly reapplied. Please post an issue on the Github.'
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

    public instExists(objName: string, instName: string): boolean {
        try {
            return this.objects[objName][instName] !== undefined;
        } catch (e) {
            return false;
        }
    }

    private instGetOriginInst(objName: string, varName: string): IOriginVar | null {
        if (this.objects[objName] && this.objects[objName][varName]) {
            return this.objects[objName][varName].origin;
        }

        return null;
    }

    public async instClearAllInstAtURI(uri: string) {
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

                if (thisOldVar.index === thisVarEntry.origin.indexOfOrigin) {
                    const newOrigin = await this.instAssignNewOrigin(
                        thisVarEntry.referenceLocations,
                        thisOldVar.object
                    );
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

    private async instAssignNewOrigin(referenceArray: Location[], objName: string): Promise<IOriginVar | null> {
        const fsManager: FileSystem = this.lsp.requestLanguageServiceHandler(LanguageService.FileSystem);
        // Our Dummy "Best Candidate"
        let bestCandidate = {
            arrayIndex: 0,
            isSelf: false,
            varRank: VariableRank.Num,
            location: Location.create('', Range.create(0, 0, 0, 0))
        };
        let dummyURI = '';

        for (let i = 0, l = referenceArray.length; i < l; i++) {
            const thisVar = referenceArray[i];
            if (!thisVar) continue;

            const thisURIInfo = await fsManager.getDocumentFolder(thisVar.uri);
            if (!thisURIInfo || !thisURIInfo.eventInfo || thisURIInfo.type !== 'GMObject') continue;
            const isSelf = thisURIInfo.name === objName;
            if (bestCandidate.isSelf == true && isSelf == false) continue;

            // Get our Supremacy; (HOLY SHIT THIS IS A RATS NEST. I guess there is such a thing as too many enums)
            let thisRank = VariableRank.Num;
            if (thisURIInfo.eventInfo.eventType === EventType.Create) {
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
                // Okay we've got the same URI. We go with the LOWER line number:
                if (bestCandidate.location.range.start.line < thisVar.range.start.line) continue;
                // If we're equal, literally fuck this dude but I shall support him.
                if (bestCandidate.location.range.start.line == thisVar.range.start.line) {
                    if (bestCandidate.location.range.start.character <= thisVar.range.start.character) continue;
                }
            }
            // ReAsign Best Candidate:
            bestCandidate = {
                arrayIndex: i,
                isSelf: isSelf,
                varRank: thisRank,
                location: thisVar
            };
            dummyURI = thisVar.uri;
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

    public instGetAllVariableReferences(objName: string, varName: string) {
        const varPackage = this.instGetVariablePackage(objName, varName);
        if (!varPackage) return null;

        return cleanArray(varPackage.referenceLocations);
    }

    public instGetOriginLocation(objName: string, varName: string) {
        const varPackage = this.instGetVariablePackage(objName, varName);
        if (varPackage === null) return null;

        return varPackage.referenceLocations[varPackage.origin.indexOfOrigin];
    }

    private instGetVariablePackage(objName: string, variableName: string) {
        const thisObjVariables = this.objects[objName];

        if (thisObjVariables && thisObjVariables[variableName]) {
            return thisObjVariables[variableName];
        }

        return null;
    }

    public objectExists(objName: string) {
        return !(this.objects[objName] == undefined);
    }

    public instGetAllInsts(objName: string): string[] {
        if (this.objects.hasOwnProperty(objName) == false) {
            return [];
        }

        return Object.getOwnPropertyNames(this.objects[objName]);
    }

    //#endregion

    //#region Enums
    public enumCreateEnum(name: string, thisRange: Range, thisURI: string) {
        // Add our URI if it's not there:
        if (this.URIRecord[thisURI] === undefined) {
            this.URIcreateURIDictEntry(thisURI);
        }

        // Check if we have a headless enum:
        const enumInfo = this.enumGetEnumInformation(name);
        let i = 0;

        // Headless macro
        if (enumInfo) {
            i = enumInfo.referenceLocations.push(Location.create(thisURI, thisRange)) - 1;
            enumInfo.origin.indexOfOrigin = i;
        } else {
            // Create our Entry in the Enum object:
            i = 0;
            this.enums[name] = {
                origin: {
                    enumMembers: {},
                    indexOfOrigin: i
                },
                referenceLocations: [Location.create(thisURI, thisRange)]
            };
        }

        // Store this Enum in the URI object:
        this.URIRecord[thisURI].enums.push({
            index: i,
            name: name
        });
    }

    public enumCreateEnumMember(
        enumName: string,
        enumMemberName: string,
        thisURI: string,
        thisRange: Range,
        thisEnumeration: string
    ) {
        // Add the Enum Member to the Object:
        const enumInfo = this.enumGetEnumInformation(enumName);
        if (!enumInfo) {
            console.log('Attempted to add enum member to enum which does not exist. Skipping...');
            return;
        }

        const enumMemberInfo = this.enumGetEnumMemberInformation(enumInfo, enumMemberName);
        let i: number;

        // Headless
        if (enumMemberInfo) {
            i = enumMemberInfo.referenceLocations.push(Location.create(thisURI, thisRange)) - 1;
            enumMemberInfo.origin = {
                indexOfOrigin: i
            };
            enumMemberInfo.value = thisEnumeration;
        } else {
            i = 0;

            enumInfo.origin.enumMembers[enumMemberName] = {
                origin: {
                    indexOfOrigin: i
                },
                referenceLocations: [Location.create(thisURI, thisRange)],
                value: thisEnumeration
            };
        }

        // Add this Enum to our URI Record:
        this.URIRecord[thisURI].enumMembers.push({
            index: i,
            name: enumMemberName,
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
        if (enumInfo === undefined) return null;

        // Return if Origin Exists
        const originLocation = this.genericGetOriginLocation(enumInfo);
        if (originLocation === null) return null;

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
        if (enumInfo === undefined) return null;

        // Check if we have an enum member
        const enumMemberInfo = this.enumGetEnumMemberInformation(enumInfo, enumMemberName);
        if (enumMemberInfo === undefined) return null;

        // Return the Origin if it exists:
        const originLocation = this.genericGetOriginLocation(enumMemberInfo);
        if (originLocation === null) return null;

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
        return cleanArray(enumInfo.referenceLocations);
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

        return cleanArray(enumMemberInfo.referenceLocations);
    }

    /**
     * Cycles through the URI record and clears all the enum entries out
     * of the EnumObject
     * @param uri The uri to clear Enums at.
     */
    public async enumClearAllEnumsAtURI(uri: string) {
        // Iterate through our URIRecord;
        if (!this.URIRecord[uri]) this.URIcreateURIDictEntry(uri);

        for (const thisEnumRecord of this.URIRecord[uri].enums) {
            // Get our Macro Information:
            const thisEnum = this.enumGetEnumInformation(thisEnumRecord.name);
            if (!thisEnum) {
                delete this.enums[thisEnumRecord.name];
                continue;
            }

            // Are we about to kill off the Origin?
            if (thisEnumRecord.index === thisEnum.origin.indexOfOrigin) {
                // Clear the indexOfOrigin to Null:
                thisEnum.origin.indexOfOrigin = null;
            }

            // Splice out the old Reference
            delete thisEnum.referenceLocations[thisEnumRecord.index];

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
    public async enumMemberClearAllEnumMembersAtURI(uri: string) {
        // Iterate through our URIRecord
        if (!this.URIRecord[uri]) this.URIcreateURIDictEntry(uri);

        for (const thisEnumMemberRecord of this.URIRecord[uri].enumMembers) {
            // Get our Enum Info:
            const enumInfo = this.enumGetEnumInformation(thisEnumMemberRecord.enumName);
            if (!enumInfo) continue;

            const thisEnumMember = this.enumGetEnumMemberInformation(enumInfo, thisEnumMemberRecord.name);
            if (!thisEnumMember) {
                delete this.enums[thisEnumMemberRecord.enumName].origin.enumMembers[thisEnumMemberRecord.name];
                continue;
            }

            // We about to delete the origin?
            if (thisEnumMemberRecord.index === thisEnumMember.origin.indexOfOrigin) {
                // Set the Origin to null
                thisEnumMember.origin.indexOfOrigin = null;
            }

            delete thisEnumMember.referenceLocations[thisEnumMemberRecord.index];

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

    public enumMemberGetEnumeration(enumName: string, enumMemberName: string): string | null {
        const enumInfo = this.enumGetEnumInformation(enumName);
        if (!enumInfo) return null;

        const enumMemberInfo = this.enumGetEnumMemberInformation(enumInfo, enumMemberName);
        if (!enumMemberInfo) return null;

        return enumMemberInfo.value;
    }

    public enumExists(enumName: string): boolean {
        if (!this.enumGetEnumInformation(enumName)) {
            return false;
        } else return true;
    }

    public enumMemberExists(enumName: string, enumMemberString: string): boolean {
        // Get our Enum Info
        const ourEnum = this.enumGetEnumInformation(enumName);
        if (!ourEnum) return false;

        // Get EnumMember
        const enumMemberInfo = this.enumGetEnumMemberInformation(ourEnum, enumMemberString);
        if (!enumMemberInfo) return false;

        return true;
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
    public getMacroList(): string[] {
        return Object.getOwnPropertyNames(this.macros);
    }

    public macroCreateMacro(name: string, value: string, thisRange: Range, thisURI: string) {
        // Add our URI if it's not there:
        if (this.URIRecord[thisURI] === undefined) {
            this.URIcreateURIDictEntry(thisURI);
        }

        const macroInfo = this.macroGetMacroInformation(name);
        let i: number;

        // Okay, we've got a headless Macro!
        if (macroInfo) {
            // Push to the macro reference
            i = this.macros[name].referenceLocations.push(Location.create(thisURI, thisRange)) - 1;

            this.macros[name].origin = {
                indexOfOrigin: i,
                value: value
            };
        } else {
            // Add this Macro to the Macro Object
            i = 0;

            this.macros[name] = {
                origin: {
                    indexOfOrigin: i,
                    value: value
                },
                referenceLocations: [Location.create(thisURI, thisRange)]
            };
        }

        // Commit this Macro to the Record Dictionary
        this.URIRecord[thisURI].macros.push({
            name: name,
            index: i
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
        if (index === null) return null;

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

    public async macroClearMacrosAtURI(uri: string) {
        // Iterate through our URIRecord;
        if (!this.URIRecord[uri]) this.URIcreateURIDictEntry(uri);

        for (const thisMacroRecord of this.URIRecord[uri].macros) {
            // Get our Macro Information:
            const macroInfo = this.macroGetMacroInformation(thisMacroRecord.name);
            // If we have no macroInformation but still have a record delete this Macro Object entry.
            if (!macroInfo) {
                delete this.macros[thisMacroRecord.name];
                continue;
            }

            // Okay, are we about to delete the origin?
            if (macroInfo.origin.indexOfOrigin === thisMacroRecord.index) {
                macroInfo.origin = {
                    indexOfOrigin: null,
                    value: 'undefined'
                };
            }

            // Splice out the old Reference
            delete macroInfo.referenceLocations[thisMacroRecord.index];

            // Delete all reference if we don't exist anymore.
            if (cleanArrayLength(macroInfo.referenceLocations) === 0) {
                delete this.macros[thisMacroRecord.name];
            }
        }

        // Clear our Record of Indexes since those indexes have been removed
        this.URIRecord[uri].macros = [];
    }

    //#endregion

    //#region General
    private genericGetOriginLocation(genModel: GenericResourceModel): Location | null {
        // If the index doesn't exist, return null
        if (genModel.origin.indexOfOrigin === null) return null;

        return genModel.referenceLocations[genModel.origin.indexOfOrigin];
    }

    public shutdownHandoff(): ProjectCache.Cache {
        return {
            CachedReference: {
                enums: this.enums,
                macros: this.macros,
                object: this.objects,
                callables: {
                    extensions: this.callables.extensions,
                    scripts: this.callables.scripts
                },
                extensionRecord: this.extensionRecord
            },
            URIRecords: this.URIRecord
        };
    }

    //#endregion
}
