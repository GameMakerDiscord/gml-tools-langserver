import { Reference, GenericResourceDescription, BasicResourceType } from './reference';
import { WorkspaceFolder } from 'vscode-languageserver';
import URI from 'vscode-uri';
import * as fse from 'fs-extra';
import * as path from 'path';
import { YYP, Resource, EventType } from 'yyp-typings';
import { IURIRecord, IObjects, IScriptsAndFunctions, IEnum, IMacro, SemanticsOption } from './declarations';
import { DocumentFolders, EventInfo, DocumentFolder, GMLFolder } from './fileSystem';
import { DiagnosticHandler } from './diagnostic';
import { Grammar } from 'ohm-js';
import { LangServ } from './langserv';

export namespace ProjectCache {
    export interface Cache {
        URIRecords: CacheURIRecords;
        CachedReference: CachedReferences;
    }

    export interface CacheURIRecords {
        [thisURI: string]: CachedURIRecord;
    }

    export interface CachedURIRecord extends IURIRecord {
        hash: string;
    }

    export interface CachedReferences {
        object: IObjects;
        scriptsAndFunctions: IScriptsAndFunctions;
        enums: { [uri: string]: IEnum };
        macros: { [uri: string]: IMacro };
        resources: GenericResourceDescription[];
    }
}

export interface InitialStartupHandOffPackage {
    Views: {
        Folders: GMLFolder[];
        Default: number;
    };
    Documents: DocumentFolders;
    YYPInformation: {
        ProjectDirectory: string;
        TopLevelDirectories: string[];
        ProjectYYPPath: string;
        ProjectYYP: YYP;
        projectResourceList: { [UUID: string]: Resource.GMResource };
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
    private projectResourceList: { [UUID: string]: Resource.GMResource };
    private rootViews: Resource.GMFolder[];
    private views: GMLFolder[];
    private defaultView: number;

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
                scriptsAndFunctions: {},
                resources: []
            }
        };
        this.projectResourceList = {};

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
        const possibleYYPs: string[] = this.topLevelDirectories.filter((thisFile) => path.extname(thisFile) === '.yyp');

        // Sort our Dinguses
        if (possibleYYPs.length !== 1) return null;

        // Set our YYP
        this.projectYYPPath = possibleYYPs[0];

        // Load our Project Cache if it's there:
        let cachedFileNames: string[] = [];
        if (this.topLevelDirectories.includes('.gml-tools')) {
            cachedFileNames = await fse.readdir(path.join(this.projectDirectory, '.gml-tools'));
        } else {
            await fse.mkdir(path.join(this.projectDirectory, '.gml-tools'));
        }

        const projectCache = cachedFileNames.filter((thisFile) => {
            thisFile == 'project-cache.json';
        });

        if (projectCache.length === 1) {
            // Get our Project Cache
            this.projectCache = JSON.parse(
                await fse.readFile(path.join(this.projectDirectory, '.gml-tools', 'project-cache.json'), 'utf8')
            );
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
         * * 1. We do a first pass on each YY and GML file referenced by the YYP,
         *  *   filling in resource names and parentage.
         *
         * * 2. We also check the GML files of anything that has a GML file and we
         * *    put them in a queue.
         *
         * * 3. We do a preliminary pass on each file in the queue. If they match the
         * *    hash before, we skip it. If the hash doesn't match, or we don't have a hash,
         * *    we check if there's a macro or enum declaration. If so, we index that file.
         *
         * * 4. We check our hash again, then we dump our saved contents and continue on our
         * *    merry way if it passed. If it includes a new Enum or Macro, we throw our save away.
         * *    If the hash didn't match, we reparse again as well!
         *
         * * 5. Do our initial view sort.
         *
         * * 6. We pass off tons and tons of info.
         */

        // ! Step Zero: Dump the Reference from the Cache
        this.reference.dumpCachedData(this.projectCache.CachedReference);

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
        const filesToParse: { fullText: string; fpath: string; passedHash: boolean }[] = [];
        const enumsAdded: string[] = [];
        const macrosAdded: string[] = [];

        for (const thisFPath of ourGMLFPaths) {
            // Load everything into memory
            const fileText = await fse.readFile(thisFPath, 'utf8');
            // const thisHash = metroHash.metrohash64(fileText, 0xabcd);

            // const ourURIRecord = this.projectCache.URIRecords;

            // Check our URIRecord
            // const ourURI = URI.file(thisFPath).toString();
            // if (ourURIRecord[ourURI] && ourURIRecord[ourURI].hash !== thisHash) {
            //     if (fileText.includes('#macro') || fileText.includes('enum')) {
            //         await this.initialGMLParse(ourURI, fileText);
            //     } else {
            //         filesToParse.push({
            //             fpath: thisFPath,
            //             fullText: fileText,
            //             passedHash: false
            //         });
            //     }
            // } else {
                filesToParse.push({
                    fpath: thisFPath,
                    fullText: fileText,
                    passedHash: true
                });
            // }
        }

        // ! Step Four: Parse everything else!
        for (const thisFile of filesToParse) {
            const ourURI = URI.file(thisFile.fpath).toString();
            // Passed Hash Check:
            if (thisFile.passedHash) {
                if (
                    enumsAdded.some((thisEnumStatement) => {
                        return thisFile.fullText.includes(thisEnumStatement);
                    }) ||
                    macrosAdded.some((thisMacro) => {
                        return thisFile.fullText.includes(thisMacro);
                    })
                ) {
                    this.initialGMLParse(ourURI, thisFile.fullText);
                } else {
                    this.reference.dumpCachedURIRecord(this.projectCache.URIRecords[ourURI], ourURI);
                }
            } else {
                this.initialGMLParse(ourURI, thisFile.fullText);
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

        // ! Step Six: Return our Returnable:
        return {
            Documents: this.documents,
            Views: {
                Default: this.defaultView,
                Folders: this.views
            },
            YYPInformation: {
                ProjectDirectory: this.projectDirectory,
                projectResourceList: this.projectResourceList,
                ProjectYYPPath: this.projectYYPPath,
                TopLevelDirectories: this.topLevelDirectories,
                ProjectYYP: this.projectYYP
            }
        };
    }

    private async initialGMLParse(thisURI: string, fullTextDocument: string) {
        // Fill our our Document Folder
        const ourDocFolder = await this.documentInitFText(thisURI, fullTextDocument);
        if (!ourDocFolder.diagnosticHandler) return;
        ourDocFolder.diagnosticHandler.setInput(fullTextDocument);

        // Figure out the Semantics To Run:
        let ourSemantics = SemanticsOption.Function | SemanticsOption.Variable;

        if (ourDocFolder.type === 'GMScript') {
            ourSemantics = SemanticsOption.All;
        }
        await this.lsp.lint(ourDocFolder.diagnosticHandler, ourSemantics);
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
            file: '',
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
            thisDocFolder.file = fullText;
        } else {
            console.log('Document:' + thisURI + ' has no document Folder to set this text to!');
            return thisDocFolder;
        }

        // Create our Diagnostic Handler
        thisDocFolder.diagnosticHandler = new DiagnosticHandler(this.grammar, thisURI, this.reference);

        // Create our URI Dictionary
        this.reference.createURIDictEntry(thisURI);

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
                // Add to UUID Dict
                this.projectResourceList[yyFile.id] = yyFile;
            }
            return;
        }

        // Add the resource (creates objects/scripts here too!)
        this.reference.addResource(yyFile.name, yyFile.modelName);
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

            return [ourPath];
        }

        // TODO Extension support

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
            // *all* our UUIDs in `this.projectResourceList`. We
            // add every resource to it in the .YYP.
            const thisChildYY = this.projectResourceList[thisChildNode];
            if (thisChildYY === undefined) continue;

            // Walk down the UUID if it's a view, else store the YY file.
            if (thisChildYY.modelName && thisChildYY.modelName == 'GMFolder') {
                newChildren.push(this.walkViewTree(thisChildYY));
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
}
