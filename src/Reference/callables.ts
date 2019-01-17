import { JSDOC, IFunction, IExtension, IURIRecords, IURIRecord, ICallable, IScript, IEvent } from '../declarations';
import { cleanArray } from '../utils';
import { Reference } from './reference';
import { Location, Range } from 'vscode-languageserver';
import { ProjectCache } from '../startAndShutdown';
import { GMLEvent } from './Reference Types/gmlEvent';
import { GMLScript } from './Reference Types/gmlScript';
import { GMLFunction } from './Reference Types/gmlFunction';
import { GMLExtension } from './Reference Types/gmlExtension';

export class Callables {
    public scripts: { [key: string]: GMLScript | undefined } = {};
    public functions: { [key: string]: GMLFunction | undefined } = {};
    public extensions: { [key: string]: GMLExtension | undefined } = {};
    public events: { [key: string]: GMLEvent | undefined } = {};
    public functionList: string[] = [];
    public extensionRecord: ProjectCache.IExtensionRecord = {};

    reference: Reference;
    URIRecord: IURIRecords;

    constructor(ref: Reference, uriRecord: IURIRecords) {
        this.reference = ref;
        this.URIRecord = uriRecord;
    }

    public getCallableHandle(callableName: string): GMLScript | GMLFunction | GMLExtension | GMLEvent | undefined {
        const script = this.scripts[callableName];
        if (script !== undefined) return script;

        const functions = this.functions[callableName];
        if (functions !== undefined) return functions;

        const extensions = this.extensions[callableName];
        if (extensions !== undefined) return extensions;

        const events = this.events[callableName];
        if (events !== undefined) return events;

        return undefined;
    }

    //#region Scripts
    public scriptAddScript(name: string, uri: string, jsdoc: JSDOC) {
        if (this.scriptExists(name)) {
            console.log(`Attempting to add ${name}, which is already a script.`);
            return;
        }

        this.scripts[name] = new GMLScript(jsdoc, uri, this, name);
    }

    public scriptGetAllScriptNames() {
        return Object.getOwnPropertyNames(this.scripts);
    }

    public scriptExists(thisName: string): Boolean {
        return this.scripts.hasOwnProperty(thisName);
    }

    /**
     * Deletes a script entirely from the internal model, including
     * any references to it. It is **not safe** to use without checking
     * that the script exists first.
     * @param thisName This is the script to the delete.
     */
    public scriptDelete(thisName: string) {
        const scriptPack = this.scripts[thisName];
        if (scriptPack === undefined) return;
        this.reference.URIRecordClearAtURI(scriptPack.uri);

        // Delete the Script itself
        delete this.scripts[thisName];

        // Delete the Resource
        this.reference.deleteResource(thisName);

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

        // Find and delete the script in the project resources
    }

    /**
     * Removes all references to a script unsafely (run scriptExists first) at
     * a given URI.
     */
    public async scriptRemoveAllReferencesAtURI(thisURI: string) {
        if (!this.URIRecord[thisURI]) this.reference.URIcreateURIDictEntry(thisURI);

        for (const thisScriptIndex of this.URIRecord[thisURI].scripts) {
            // Get our Script Pack
            const scriptPack = this.scripts[thisScriptIndex.name];
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
        const scriptPack = this.scripts[thisScriptName];
        if (!scriptPack) return null;

        return cleanArray(scriptPack.referenceLocations);
    }
    //#endregion

    //#region Events
    public eventDelete(uri: string) {
        // Clean the URI
        this.reference.URIRecordClearAtURI(uri);

        // Delete the Event Record itself
        delete this.events[uri];

        // TODO Iterate on URI Records which call this Event.
        // This will be for parenting and "Event Perform" calls

        // Iterate on the URIRecords. Deleting an event is rar
        for (const thisRecordName in this.URIRecord) {
            if (this.URIRecord.hasOwnProperty(thisRecordName)) {
                const thisRecord = this.URIRecord[thisRecordName];

                for (let i = 0; i < thisRecord.events.length; i++) {
                    const thisEvent = thisRecord.events[i];

                    if (thisEvent.name === uri) {
                        delete thisRecord.events[i];
                    }
                }

                // Clean the Array and Return it
                thisRecord.events = cleanArray(thisRecord.events);
            }
        }
    }

    public async eventRemoveAllReferencesAtURI(thisRecord: IURIRecord) {
        for (const thisEventRecord of thisRecord.events) {
            // Get our Script Pack
            const gmlEvent = this.events[thisEventRecord.name];
            if (!gmlEvent) return;

            // Splice out the old location:
            delete gmlEvent.referenceLocations[thisEventRecord.index];
        }

        // Clear our Record of Indexes since those indexes have been removed:
        thisRecord.events = [];
    }

    public eventGetAllReferences(thisURI: string): Location[] | null {
        const refs = this.events[thisURI];
        if (!refs) return null;

        return cleanArray(refs.referenceLocations);
    }
    //#endregion

    //#region Functions
    public functionAddFunction(name: string, thisJSDOC: JSDOC, doNotAutoComplete: boolean) {
        this.functions[name] = new GMLFunction(thisJSDOC, this, name, doNotAutoComplete);
    }

    public functionOverwriteJSON(thisPack: IFunction, thisJSDOC: JSDOC) {
        thisPack.JSDOC = thisJSDOC;
    }

    public functionGetAllFunctionNames() {
        return this.functionList;
    }

    public functionAddReference(name: string, uri: string, range: Range) {
        const ourFunction: IFunction | undefined = this.functions[name];
        if (!ourFunction) return;

        ourFunction.referenceLocations.push(Location.create(uri, range));
    }

    public functionRemoveAllReferencesAtURI(thisURI: string) {
        const thisURIRecord = this.reference.URIgetURIRecord(thisURI);

        for (const thisFunctionRecord of thisURIRecord.functions) {
            // Get our Script Pack
            const ourFunction: IFunction | undefined = this.functions[name];
            if (!ourFunction) return;

            // Splice out the old location:
            delete ourFunction.referenceLocations[thisFunctionRecord.index];
        }

        // Clear our Record of Indexes since those indexes have been removed:
        this.URIRecord[thisURI].functions = [];
    }

    public functionGetAllReferences(thisName: string): Location[] | null {
        const ourFunction: IFunction | undefined = this.functions[name];
        if (!ourFunction) return null;

        return cleanArray(ourFunction.referenceLocations);
    }
    //#endregion

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

        this.extensions[thisName] = new GMLExtension(thisJSDOC, thisName, originLoc, doNotAutoComplete, this);

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

    public extensionOverwriteJSON(thisPack: IExtension, thisJSDOC: JSDOC) {
        thisPack.JSDOC = thisJSDOC;
    }

    public extensionGetAllExtensionNames() {
        return Object.getOwnPropertyNames(this.extensions);
    }

    public extensionRemoveAllReferencesAtURI(thisURI: string) {
        const thisURIRecord = this.reference.URIgetURIRecord(thisURI);

        for (const thisExtensionRecord of thisURIRecord.extensions) {
            // Get our Script Pack
            const ourExtensionPack = this.extensions[thisExtensionRecord.name];
            if (ourExtensionPack === undefined) return;

            // Splice out the old location:
            delete ourExtensionPack.referenceLocations[thisExtensionRecord.index];
        }

        // Clear our Record of Indexes since those indexes have been removed:
        this.URIRecord[thisURI].extensions = [];
    }

    public extensionGetAllReferences(thisName: string): Location[] | null {
        const ourExtensionPack = this.extensions[thisName];
        if (ourExtensionPack === undefined) return null;

        return cleanArray(ourExtensionPack.referenceLocations);
    }
    //#endregion
}
