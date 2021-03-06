import { Reference, BasicResourceType } from './reference';
import { WorkspaceFolder, Location, Range } from 'vscode-languageserver';
import URI from 'vscode-uri';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { YYP, Resource, EventType } from 'yyp-typings';
import {
    IURIRecord,
    IObjects,
    IEnum,
    IMacro,
    SemanticsOption,
    IScript,
    IExtension,
    GMLFolder,
    DocumentFolders,
    EventInfo,
    DocumentFolder,
    JSDOCParameter,
    JSDOC
} from './declarations';
import { DiagnosticHandler } from './diagnostic';
import { Grammar } from 'ohm-js';
import { LangServ } from './langserv';
import { getPositionFromIndex } from './utils';

export namespace ProjectCache {
    export interface Cache {
        URIRecords: CacheURIRecords;
        CachedReference: CachedReferences;
    }

    export interface CacheURIRecords {
        [thisURI: string]: IURIRecord;
    }

    export interface CachedReferences {
        object: IObjects;
        callables: CachedCallables;
        enums: { [uri: string]: IEnum };
        macros: { [uri: string]: IMacro };
        extensionRecord: IExtensionRecord;
    }

    export interface CachedCallables {
        scripts: { [key: string]: IScript };
        extensions: { [key: string]: IExtension };
    }

    export interface IExtensionRecord {
        [extensionName: string]: IExtensionFileNames;
    }

    export interface IExtensionFileNames {
        [extensionFileName: string]: {
            contributedFunctions: string[];
            hash: string;
        };
    }
}

export interface InitialStartupHandOffPackage {
    Views: {
        folder: GMLFolder[];
        default: number;
        rootViews: Resource.GMFolder[];
    };
    Documents: DocumentFolders;
    YYPInformation: {
        projectDirectory: string;
        topLevelDirectories: string[];
        projectYYPPath: string;
        projectYYP: YYP;
        projectResources: { [UUID: string]: Resource.GMResource };
    };
    CachedInformation: {
        cachedFileNames: string[];
    };
}

export class InitialAndShutdown {
    private reference: Reference;
    private projectDirectory: string;
    private topLevelDirectories: string[];
    private projectYYP: YYP | null;
    private projectYYPPath: string;
    private projectCache: ProjectCache.Cache;
    private documents: DocumentFolders;
    private grammar: Grammar;
    private lsp: LangServ;
    private projectResources: { [UUID: string]: Resource.GMResource };
    private rootViews: Resource.GMFolder[];
    private views: GMLFolder[];
    private defaultView: number;
    private cachedFileNames: string[];

    constructor(ref: Reference, grammar: Grammar, lsp: LangServ) {
        // General Project Properties
        this.projectDirectory = '';
        this.topLevelDirectories = [];

        // YYP Nonsense
        this.projectYYP = null;
        this.projectYYPPath = '';
        this.projectCache = {
            URIRecords: {},
            CachedReference: {
                enums: {},
                macros: {},
                object: {},
                callables: {
                    extensions: {},
                    scripts: {}
                },
                extensionRecord: {}
            }
        };
        this.projectResources = {};
        this.cachedFileNames = [];

        // Views crap
        this.rootViews = [];
        this.views = [];
        this.defaultView = 0;

        // Other Modules
        this.reference = ref;
        this.grammar = grammar;
        this.lsp = lsp;

        // Tools
        this.documents = {};
    }

    public async initialWorkspaceFolders(
        workspaceFolder: WorkspaceFolder[]
    ): Promise<InitialStartupHandOffPackage | null> {
        // Save our Project Directory
        this.projectDirectory = URI.parse(workspaceFolder[0].uri).fsPath;

        // Get our Directories
        this.topLevelDirectories = await fse.readdir(this.projectDirectory);

        // Get our YYPs
        const possibleYYPs: string[] = this.topLevelDirectories.filter(thisFile => path.extname(thisFile) === '.yyp');

        // Sort our Dinguses
        if (possibleYYPs.length !== 1) return null;

        // Set our YYP
        this.projectYYPPath = possibleYYPs[0];

        // Load our Project Cache if it's there:
        this.cachedFileNames = await this.initialCheckCache();

        const projectCache = this.cachedFileNames.filter(thisFile => {
            return thisFile == 'project-cache.json';
        });
        if (projectCache.length === 1) {
            // Get our Project Cache
            this.projectCache = JSON.parse(
                await fse.readFile(path.join(this.projectDirectory, '.gml-tools', 'project-cache.json'), 'utf8')
            );
        }

        // Create our Default Folders, even if they're just blanks
        const ourResources = [
            'datafiles',
            'datafiles_yy',
            'extensions',
            'fonts',
            'notes',
            'objects',
            'options',
            'paths',
            'rooms',
            'scripts',
            'shaders',
            'sounds',
            'sprites',
            'tilesets',
            'timelines',
            'views'
        ];
        for (const thisFolderName of ourResources) {
            try {
                await fse.ensureDir(path.join(this.projectDirectory, thisFolderName));
            } catch (e) {
                console.log('Error in creating folder names. Please report an error on the Github page.');
            }
        }

        return await this.initialIndexProject();
    }

    private async initialIndexProject(): Promise<InitialStartupHandOffPackage | null> {
        // Get our YYP
        const rawYYP = await fse.readFile(this.projectYYPPath, 'utf8');
        this.projectYYP = JSON.parse(rawYYP);
        if (!this.projectYYP) return null;

        /**
         * * General overview of how we parse the YYP:
         *
         * * 0. Dump the cached resources into Reference.
         * * 1. We do a first pass on each YY and GML file referenced by the YYP,
         * *    filling in resource names and parentage. If it's a view, take it out
         * *    and add it to the view queue.
         *
         * * 2. We also check the GML files of anything that has a GML file and we
         * *    put them in a queue unless its an extesnion, in which case we parse it.
         *
         * * 3. We do a preliminary pass on each file in the queue. If they match the
         * *    hash from the cache, we skip it. If the hash doesn't match, or we don't have a hash,
         * *    we check if there's a macro or enum declaration. If so, we parse it.
         *
         * * 4. Now, we go through everything from the queue again. If it passed the hash,
         * *    we now check if it uses any of the macros/enums we just parsed from the new files.
         * *    If so, we throw the save away and reparse -- otherwise, we dump the saved data
         * *    of that file into Reference.
         *
         * * 5. Do our initial view sort.
         *
         * * 6. Validate Reference. We go through every single thing in Reference and validate
         * *    that each actually exists. Empty enums, unreferenced macros, variables, etc. get
         * *    cleared. Objects with no files get cleared as well.
         *
         * * 6. We pass off the handoff of all our documents to the Filesystem and tell the LS to kill us.
         */

        // ! Step Zero: Dump the Reference from the Cache
        this.reference.initDumpCachedData(this.projectCache.CachedReference);

        // ! Step One: Index the YYP Resources, so we have all resource names:
        const projectYYs: Resource.GMResource[] = [];
        for (const thisResource of this.projectYYP.resources) {
            let yyFile: Resource.GMResource;
            try {
                yyFile = JSON.parse(
                    await fse.readFile(path.join(this.projectDirectory, thisResource.Value.resourcePath), 'utf8')
                );
            } catch (e) {
                continue;
            }
            await this.initialParseYYFile(yyFile);

            projectYYs.push(yyFile);
        }

        // ! Step Two: Make a queue of all the GML files in the project, adding to the documents:
        let ourGMLFPaths: string[] = [];
        for (const thisYY of projectYYs) {
            const theseFPaths = await this.initialGetGMLFiles(thisYY);
            ourGMLFPaths = ourGMLFPaths.concat(theseFPaths);
        }

        // ! Step Three: Do a pass on the queue for macros and enums
        const filesToParse: { fullText: string; fpath: string; passedHash: boolean; hash: string }[] = [];
        const enumsAdded: string[] = [];
        const macrosAdded: string[] = [];

        for (const thisFPath of ourGMLFPaths) {
            // Load everything into memory
            const fileText = await fse.readFile(thisFPath, 'utf8');
            const ourHasher = crypto.createHash('sha1');
            const thisHash = ourHasher.update(fileText).digest('hex');

            const ourURIRecord = this.projectCache.URIRecords;

            // Check our URIRecord
            const ourURI = URI.file(thisFPath).toString();

            if (!ourURIRecord[ourURI] || ourURIRecord[ourURI].hash !== thisHash) {
                if (ourURIRecord[ourURI]) console.log(`We don't have a hash for: \n   ${ourURI}.`);
                else console.log('We had a hash but it was wrong.');
                // and if it includes "macro" or "enum"...
                if (fileText.includes('#macro') || fileText.includes('enum')) {
                    console.log(`...and it had a macro or enum declaration in it. Parsing...`);
                    await this.initialGMLParse(ourURI, fileText, thisHash);
                } else {
                    filesToParse.push({
                        fpath: thisFPath,
                        fullText: fileText,
                        passedHash: false,
                        hash: thisHash
                    });
                }
            } else {
                filesToParse.push({
                    fpath: thisFPath,
                    fullText: fileText,
                    passedHash: true,
                    hash: thisHash
                });
            }
        }

        // ! Step Four: Parse everything else!
        for (const thisFile of filesToParse) {
            const ourURI = URI.file(thisFile.fpath).toString();
            // Passed Hash Check:
            if (thisFile.passedHash) {
                // ! This check is always empty. We don't need it yet -- it's for super rare cases.
                if (
                    enumsAdded.some(thisEnumStatement => {
                        return thisFile.fullText.includes(thisEnumStatement);
                    }) ||
                    macrosAdded.some(thisMacro => {
                        return thisFile.fullText.includes(thisMacro);
                    })
                ) {
                    this.initialGMLParse(ourURI, thisFile.fullText, thisFile.hash);
                } else {
                    this.reference.initDumpCachedURIRecord(this.projectCache.URIRecords[ourURI], ourURI, thisFile.hash);
                }
            } else {
                console.log(`Initial GML Parse for: \n  ${ourURI}`);
                this.initialGMLParse(ourURI, thisFile.fullText, thisFile.hash);
            }
        }
        
        // ! Step Five: Figure out our Silly View Situation
        // Iterate on our Roots:
        for (const thisRoot of this.rootViews) {
            // Walk the Tree.
            const finalView = await this.walkViewTree(thisRoot);
            this.views.push(finalView);

            // Add it to the default View
            if (thisRoot.isDefaultView) {
                this.defaultView = this.views.length - 1;
            }
        }

        // ! Step Six: Validate our Reference Cache for ghosts
        // Tell the reference to validate
        await this.reference.initValidateCache();

        // ! Step Six: Return our Returnable:
        return {
            Documents: this.documents,
            Views: {
                default: this.defaultView,
                folder: this.views,
                rootViews: this.rootViews
            },
            YYPInformation: {
                projectDirectory: this.projectDirectory,
                projectResources: this.projectResources,
                projectYYPPath: this.projectYYPPath,
                topLevelDirectories: this.topLevelDirectories,
                projectYYP: this.projectYYP
            },
            CachedInformation: {
                cachedFileNames: this.cachedFileNames
            }
        };
    }

    private async initialGMLParse(thisURI: string, fullTextDocument: string, hash: string) {
        // Fill our our Document Folder
        const ourDocFolder = await this.documentInitFText(thisURI, fullTextDocument);
        if (!ourDocFolder.diagnosticHandler) return;
        ourDocFolder.diagnosticHandler.setInput(fullTextDocument);

        // Figure out the Semantics To Run:
        let ourSemantics: SemanticsOption = SemanticsOption.Function | SemanticsOption.Variable;

        if (ourDocFolder.type === 'GMScript') {
            ourSemantics = SemanticsOption.All;
        }
        await this.lsp.lint(ourDocFolder.diagnosticHandler, ourSemantics, ourDocFolder);
        await this.reference.URISetHash(thisURI, hash);
    }

    private async documentCreateDocumentFolder(
        path: string,
        name: string,
        type: BasicResourceType,
        eventEntry?: EventInfo
    ) {
        let uri = URI.file(path).toString();

        const thisDocFolder: DocumentFolder = {
            name: name,
            type: type,
            fileFullText: '',
            diagnosticHandler: null
        };

        if (eventEntry) {
            thisDocFolder.eventInfo = eventEntry;
        }

        this.documents[uri] = thisDocFolder;
    }

    private async documentInitFText(thisURI: string, fullText: string): Promise<DocumentFolder> {
        // Create our File
        const thisDocFolder = this.documents[thisURI];
        if (thisDocFolder) {
            thisDocFolder.fileFullText = fullText;
        } else {
            console.log('Document:' + thisURI + ' has no document Folder to set this text to!');
            return thisDocFolder;
        }

        // Create our Diagnostic Handler
        thisDocFolder.diagnosticHandler = new DiagnosticHandler(this.grammar, thisURI, this.reference);

        // Create our URI Dictionary
        this.reference.URIcreateURIDictEntry(thisURI);

        // Return our File-Folder
        return thisDocFolder;
    }

    private async initialParseYYFile(yyFile: Resource.GMResource) {
        // Index our views:
        if (yyFile.modelName === 'GMFolder') {
            // Check if we're a Root:
            if (yyFile.filterType == 'root') {
                this.rootViews.push(yyFile);
            } else {
                // Add to Project Resources
                this.projectResources[yyFile.id] = yyFile;
            }
            return;
        }

        // Add the resource (creates objects/scripts here too!)
        this.reference.addResource(yyFile.name, yyFile.modelName);
        this.projectResources[yyFile.id] = yyFile;
    }

    private async initialGetGMLFiles(yyFile: Resource.GMResource): Promise<string[]> {
        // * Objects
        if (yyFile.modelName === 'GMObject') {
            const ourReturn = [];

            for (const thisEvent of yyFile.eventList) {
                // Get the Filename
                const fileName = this.convertEventEnumToFPath(thisEvent);
                const fullPath = path.join(this.projectDirectory, 'objects', yyFile.name, fileName);
                ourReturn.push(fullPath);

                // Add to our Documents
                this.documentCreateDocumentFolder(fullPath, yyFile.name, 'GMObject', {
                    eventNumb: thisEvent.enumb,
                    eventType: thisEvent.eventtype
                });
            }

            return ourReturn;
        }

        // * Scripts
        if (yyFile.modelName === 'GMScript') {
            // Add to our Documents
            const ourPath = path.join(this.projectDirectory, 'scripts', yyFile.name, yyFile.name + '.gml');
            this.documentCreateDocumentFolder(ourPath, yyFile.name, 'GMScript');
            this.reference.scriptSetURI(yyFile.name, URI.file(ourPath).toString());

            return [ourPath];
        }

        // * Extensions
        if (yyFile.modelName === 'GMExtension') {
            const thisExtensionCache = this.projectCache.CachedReference.extensionRecord[yyFile.name];
            for (const thisFile of yyFile.files) {
                // For non-GML extensions, we parse and hash their YY entry:
                if (thisFile.kind !== 2 || thisFile.filename.includes('.gml') === false) {
                    // Check our Hash
                    const ourHasher = crypto.createHash('sha1');
                    const thisHash = ourHasher.update(JSON.stringify(thisFile)).digest('hex');

                    if (thisExtensionCache && thisExtensionCache[thisFile.filename]) {
                        const cachedHash = thisExtensionCache[thisFile.filename].hash;
                        if (cachedHash === thisHash) {
                            for (const thisExtName in this.projectCache.CachedReference.callables.extensions) {
                                if (
                                    this.projectCache.CachedReference.callables.extensions.hasOwnProperty(thisExtName)
                                ) {
                                    const thisExt = this.projectCache.CachedReference.callables.extensions[thisExtName];
                                    this.reference.extensionAddExtension(
                                        thisExtName,
                                        thisExt.JSDOC,
                                        thisExt.doNotAutoComplete,
                                        thisExt.originLocation,
                                        yyFile.name,
                                        thisFile.filename,
                                        thisExt.referenceLocations
                                    );
                                }
                            }
                            this.reference.extensionRecordSetHash(yyFile.name, thisFile.filename, thisHash);
                            continue;
                        }
                    }

                    // Iterate on each function
                    for (const thisFunc of thisFile.functions) {
                        // Number of Params
                        const minArg = thisFunc.argCount === -1 ? 0 : thisFunc.argCount;
                        const maxArg = minArg === -1 ? 9999 : minArg;

                        // Param Descriptions
                        const ourParams: JSDOCParameter[] = [];
                        for (let i = 0; i < thisFunc.args.length; i++) {
                            const thisArg = thisFunc.args[i];
                            const thisArgDescription = thisArg == 1 ? 'string' : 'real';

                            ourParams.push({
                                documentation: thisArgDescription,
                                label: 'Argument' + (i + 1)
                            });
                        }

                        // Return Type
                        const ourReturn = thisFunc.returnType == 1 ? 'string' : 'real';

                        const ourJSDOC: JSDOC = {
                            description: thisFunc.help,
                            isScript: true,
                            minParameters: minArg,
                            maxParameters: maxArg,
                            signature: thisFunc.name,
                            parameters: ourParams,
                            returns: ourReturn
                        };

                        // Do autocomplete?
                        const doNotAutoComplete = thisFunc.hidden || thisFunc.name.charAt(0) === '_';

                        // Get our YYFile Path
                        const ourPath = path.join(
                            this.projectDirectory,
                            'extensions',
                            yyFile.name,
                            yyFile.name + '.yy'
                        );

                        this.reference.extensionAddExtension(
                            thisFunc.name,
                            ourJSDOC,
                            doNotAutoComplete,
                            Location.create(URI.file(ourPath).toString(), Range.create(0, 0, 0, 0)),
                            yyFile.name,
                            thisFile.filename
                        );
                    }
                    this.reference.extensionRecordSetHash(yyFile.name, thisFile.filename, thisHash);
                } else {
                    // Get our GML File:
                    const fpath = path.join(this.projectDirectory, 'extensions', yyFile.name, thisFile.filename);
                    const thisURI = URI.file(fpath);
                    const extensionFile = await fse.readFile(fpath, 'utf8');

                    // Check our Hash
                    const ourHasher = crypto.createHash('sha1');
                    const thisHash = ourHasher.update(extensionFile).digest('hex');

                    if (thisExtensionCache && thisExtensionCache[thisFile.filename]) {
                        const cachedHash = thisExtensionCache[thisFile.filename].hash;
                        if (cachedHash === thisHash) {
                            for (const thisExtName in this.projectCache.CachedReference.callables.extensions) {
                                if (
                                    this.projectCache.CachedReference.callables.extensions.hasOwnProperty(thisExtName)
                                ) {
                                    const thisExt = this.projectCache.CachedReference.callables.extensions[thisExtName];
                                    this.reference.extensionAddExtension(
                                        thisExtName,
                                        thisExt.JSDOC,
                                        thisExt.doNotAutoComplete,
                                        thisExt.originLocation,
                                        yyFile.name,
                                        thisFile.filename,
                                        thisExt.referenceLocations
                                    );
                                }
                            }
                            this.reference.extensionRecordSetHash(yyFile.name, thisFile.filename, thisHash);
                            continue;
                        }
                    }

                    // Split up our GML File, because this thing is fucked:
                    const ourGMLFiles = extensionFile.split(/(^|\n)#define /);

                    // Create a document handler. Boy this is gonna be slow.
                    const thisDocHandler = new DiagnosticHandler(this.grammar, thisURI.toString(), this.reference);

                    let caretPos = 0;
                    for (const thisFunc of ourGMLFiles) {
                        const findFirstIndex = thisFunc.indexOf('\n');
                        if (findFirstIndex === -1) continue;

                        // Get our FuncName:
                        const funcName = thisFunc.substring(0, findFirstIndex).trim();
                        const ourInput = thisFunc.substring(findFirstIndex + 1);

                        // Find our Corresponding Function Entry
                        const ourFunctionEntry = thisFile.functions.find(thisEntry => {
                            return thisEntry.name === funcName;
                        });

                        // Set our Match
                        thisDocHandler.setInput(ourInput);

                        // Match
                        if (thisDocHandler.match() == false) {
                            console.log('Failed to parse: ' + funcName + '...');
                            continue;
                        }

                        // Run our Diagnostics:
                        const ourJSDOC = await thisDocHandler.runSemanticExtensionJSDOC(
                            thisDocHandler.getMatchResult()
                        );
                        ourJSDOC.signature = funcName;

                        // Figure out if we're hidden.
                        const doAutoComplete =
                            ourFunctionEntry !== undefined
                                ? ourFunctionEntry.hidden || funcName.charAt(0) === '_'
                                : funcName.charAt(0) === '_';

                        // Get our Location
                        const ourLocation = Location.create(
                            thisURI.toString(),
                            Range.create(
                                getPositionFromIndex(extensionFile, caretPos),
                                getPositionFromIndex(extensionFile, caretPos + findFirstIndex)
                            )
                        );

                        // Create our new Extension
                        this.reference.extensionAddExtension(
                            funcName,
                            ourJSDOC,
                            doAutoComplete,
                            ourLocation,
                            yyFile.name,
                            thisFile.filename
                        );
                        this.reference.extensionRecordSetHash(yyFile.name, thisFile.filename, thisHash);

                        // Update the Caret
                        caretPos += thisFunc.length;
                    }
                }
            }
        }

        // TODO Support for Room Creation Code

        // TODO Support for Instance Creation Code

        return [];
    }

    private convertEventEnumToFPath(thisEvent: Resource.ObjectEvent): string {
        switch (thisEvent.eventtype) {
            case EventType.Create:
                return 'Create_0.gml';
            case EventType.Alarm:
                return 'Alarm_' + thisEvent.enumb.toString() + '.gml';
            case EventType.Destroy:
                return 'Destroy_0.gml';
            case EventType.Step:
                return 'Step_' + thisEvent.enumb.toString() + '.gml';
            case EventType.Collision:
                return 'Collision_' + thisEvent.id + '.gml';
            case EventType.Keyboard:
                return 'Keyboard_' + thisEvent.enumb.toString() + '.gml';
            case EventType.Mouse:
                return 'Mouse_' + thisEvent.enumb.toString() + '.gml';
            case EventType.Other:
                return 'Other_' + thisEvent.enumb.toString() + '.gml';
            case EventType.Draw:
                return 'Draw_' + thisEvent.enumb.toString() + '.gml';
            case EventType.KeyPress:
                return 'KeyPress_' + thisEvent.enumb.toString() + '.gml';
            case EventType.KeyRelease:
                return 'KeyRelease_' + thisEvent.enumb.toString() + '.gml';
            case EventType.Trigger:
                console.log('We got a Trigger event here. Somehow this project is from GM8?');
                return 'Trigger_' + thisEvent.enumb.toString() + '.gml';
            case EventType.CleanUp:
                return 'CleanUp_0.gml';
            case EventType.Gesture:
                return 'Gesture_' + thisEvent.enumb.toString() + '.gml';
        }
        console.log(
            'NonGML file indexed by YYP? Serious error. \n' +
                'This event: ' +
                thisEvent.eventtype +
                '/' +
                thisEvent.enumb
        );
        return '';
    }

    private async walkViewTree(initialView: Resource.GMFolder): Promise<GMLFolder> {
        let newChildren: any = [];
        let finalView = await this.constructGMLFolderFromGMFolder(initialView);

        for (const thisChildNode of initialView.children) {
            // Find the resource of this UUID by scanning through
            // all our UUIDs in `this.projectResourceList`. We
            // add every resource to it in the .YYP.
            const thisChildYY = this.projectResources[thisChildNode];
            if (thisChildYY === undefined) continue;

            // Walk down the UUID if it's a view, else store the YY file.
            if (thisChildYY.modelName && thisChildYY.modelName == 'GMFolder') {
                newChildren.push(await this.walkViewTree(thisChildYY));
            } else {
                newChildren.push(thisChildYY);
            }
        }

        finalView.children = newChildren;
        return finalView;
    }

    private async constructGMLFolderFromGMFolder(init: Resource.GMFolder): Promise<GMLFolder> {
        return {
            name: init.name,
            mvc: init.mvc,
            modelName: 'GMLFolder',
            localisedFolderName: init.localisedFolderName,
            isDefaultView: init.isDefaultView,
            id: init.id,
            folderName: init.folderName,
            filterType: init.filterType,
            children: []
        };
    }

    private async initialCheckCache(): Promise<string[]> {
        if (this.topLevelDirectories.includes('.gml-tools')) {
            return await fse.readdir(path.join(this.projectDirectory, '.gml-tools'));
        } else {
            // Create the Cache:
            await this.createCache();
            return [];
        }
    }

    private async createCache() {
        await fse.mkdir(path.join(this.projectDirectory, '.gml-tools'));
    }
}
