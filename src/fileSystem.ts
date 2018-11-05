import * as fse from 'fs-extra';
import * as path from 'path';
import { Grammar } from 'ohm-js';
import { DiagnosticHandler } from './diagnostic';
import { LangServ } from './langserv';
import { Reference, BasicResourceType } from './reference';
import * as uuidv4 from 'uuid/v4';
import URI from 'vscode-uri/lib/umd';
import * as chokidar from 'chokidar';
import { ResourceNames, IScript, DocumentFolders, GMLFolder, DocumentFolder, EventInfo, GMResourcePlus } from './declarations';
import * as rubber from 'gamemaker-rubber';
import { Resource, EventType, EventNumber, YYP, YYPResource } from 'yyp-typings';
import { ClientViewNode, ResourcePackage } from './sharedTypes';
import * as Ajv from 'ajv';
import { InitialStartupHandOffPackage, ProjectCache } from './startAndShutdown';
import * as crypto from 'crypto';

/**
 * The FileSystem class is our document manager. It handles
 * I/O for the system, and stores the locations of our Document
 * DiagnosticHandlers. In the future, we might look into moving
 * the DiagnosticHandlers to the LSP class.
 */
export class FileSystem {
    /**
     * The top level folder of the workplace. Everything
     * happens in here.
     */
    private projectDirectory: string;

    /**
     * All the folders and files in this.topLevelFolder
     */
    private topLevelDirectories: string[];

    /**
     * Grammar object, which can contain more than one
     * Ohm grammar. This is where we could load in Grammars
     * for shaders, if we wanted to make that ourselves.
     */
    private grammar: Grammar;

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
    private views: GMLFolder[];

    private cachedFileNames: string[];
    private defaultView: number;
    private emptySHA1Hash: string;
    private projectResources: { [UUID: string]: Resource.GMResource | undefined };
    private rootViews: Resource.GMFolder[];
    private currentlyCreatingResources: boolean;

    constructor(standardGrammar: Grammar, lsp: LangServ) {
        this.views = [];
        this.grammar = standardGrammar;
        this.lsp = lsp;
        this.reference = this.lsp.reference;
        this.documents = {};
        this.openedDocuments = [];
        this.indexComplete = false;
        this.projectDirectory = '';
        this.topLevelDirectories = [];
        this.projectYYPPath = '';
        this.defaultView = 0;
        this.rootViews = [];
        this.cachedFileNames = [];
        this.emptySHA1Hash = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
        this.projectResources = {};
        this.currentlyCreatingResources = false;
    }

    //#region Init & Shutdown
    public async initHandOff(handOff: InitialStartupHandOffPackage) {
        // YYP Nonsense
        this.projectDirectory = handOff.YYPInformation.projectDirectory;
        this.projectYYPPath = handOff.YYPInformation.projectYYPPath;
        this.projectYYP = handOff.YYPInformation.projectYYP;
        this.topLevelDirectories = handOff.YYPInformation.topLevelDirectories;
        this.projectResources = handOff.YYPInformation.projectResources;

        // Views
        this.views = handOff.Views.folder;
        this.defaultView = handOff.Views.default;
        this.rootViews = handOff.Views.rootViews;

        // Documents
        this.documents = handOff.Documents;

        // Install handler on the YYP
        await this.installProjectYYPWatcher();

        // Index Complete
        this.indexComplete = true;
    }

    public async shutdownCache(fileHandOff: ProjectCache.Cache) {
        // Encode the text
        const buff = Buffer.from(JSON.stringify(fileHandOff, null, 4));

        // Save the text
        fse.writeFileSync(path.join(this.projectDirectory, '.gml-tools', 'project-cache.json'), buff);
    }
    //#endregion

    //#region Views
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

    public viewsGetInitialViews() {
        return this.viewsGetThisViewClient(this.views[this.defaultView].id);
    }

    public viewsGetThisViewClient(nodeUUID: string): ClientViewNode[] | null {
        const ourNode = this.searchViewsForUUID(nodeUUID);
        if (!ourNode) return [];

        if (ourNode.modelName == 'GMLFolder') {
            let returnView: ClientViewNode[] = [];

            for (const thisNode of ourNode.children) {
                const thisView: ClientViewNode = {
                    id: thisNode.id,
                    modelName: thisNode.modelName,
                    name: thisNode.name,
                    fpath: this.createFPFromBase(thisNode),
                    filterType: thisNode.modelName
                };

                if (thisNode.modelName == 'GMLFolder' || thisNode.modelName == 'GMFolder') {
                    thisView.modelName = 'GMFolder';
                    thisView.name = this.makePrettyFileNames(thisNode.folderName);
                    thisView.filterType = thisNode.filterType;
                }

                returnView.push(thisView);
            }
            return returnView;
        } else if (ourNode.modelName == 'GMObject') {
            let returnView: ClientViewNode[] = [];
            for (const thisEvent of ourNode.eventList) {
                returnView.push({
                    fpath: this.convertEventEnumToFPath(thisEvent, this.createFPFromBase(ourNode)),
                    id: ourNode.id + ':' + thisEvent.id,
                    modelName: 'GMEvent',
                    name: this.convertEventEnumToName(thisEvent),
                    filterType: ourNode.modelName
                });
            }
            return returnView;
        } else if (ourNode.modelName == 'GMShader') {
            return [
                {
                    fpath: path.join(this.createFPFromBase(ourNode), ourNode.name + '.vsh'),
                    id: ourNode.id + ':Vertex',
                    modelName: 'GMVertexShader',
                    name: ourNode.name + '.vsh',
                    filterType: ourNode.modelName
                },
                {
                    fpath: path.join(this.createFPFromBase(ourNode), ourNode.name + '.fsh'),
                    id: ourNode.id + ':Fragment',
                    modelName: 'GMFragmentShader',
                    name: ourNode.name + '.fsh',
                    filterType: ourNode.modelName
                }
            ];
        } else if (ourNode.modelName == 'GMSprite') {
            let returnView: ClientViewNode[] = [];
            const dirPath = this.createFPFromBase(ourNode);
            let frameNumber = 0;

            for (const thisSpriteImage of ourNode.frames) {
                returnView.push({
                    fpath: path.join(dirPath, thisSpriteImage.id + '.png'),
                    id: thisSpriteImage.id + ':' + ourNode.id,
                    modelName: 'GMSpriteFrame',
                    name: 'Frame ' + frameNumber,
                    filterType: ourNode.modelName
                });
                frameNumber++;
                return returnView;
            }
        }

        return [];
    }

    public async viewsInsertViewsAtNode(parentUUID: string, yysToInstert: GMResourcePlus[]) {
        const thisNode = this.searchViewsForUUID(parentUUID);
        if (!thisNode || thisNode.modelName != 'GMLFolder') return;

        // Update our Internally held model of the views:
        for (const thisView of yysToInstert) {
            thisNode.children.push(thisView);
        }

        // We have "GMLFolders", and we need to save "GMFolders"
        const newView: Resource.GMFolder = {
            children: thisNode.children.map(thisEntry => thisEntry.id),
            filterType: thisNode.filterType,
            folderName: thisNode.folderName,
            id: thisNode.id,
            isDefaultView: thisNode.isDefaultView,
            localisedFolderName: thisNode.localisedFolderName,
            modelName: 'GMFolder',
            mvc: thisNode.mvc,
            name: thisNode.name
        };

        // Save it to disk:
        const fpath = path.join(this.projectDirectory, 'views', thisNode.id + '.yy');
        try {
            await fse.writeFile(fpath, JSON.stringify(newView, null, 4));
        } catch (err) {
            console.log('Failed to write to file at: ' + fpath);
        }
    }

    // private viewsFindDefaultViewFolders(viewType: string): GMLFolder | Resource.GMFolder | null {
    //     const checkArray = [
    //         'sprites',
    //         'sounds',
    //         'paths',
    //         'scripts',
    //         'shaders',
    //         'fonts',
    //         'timelines',
    //         'objects',
    //         'rooms',
    //         'notes',
    //         'extensions',
    //         'options',
    //         'tilesets',
    //         'datafiles',
    //         'configs'
    //     ];

    //     if (checkArray.includes(viewType) == false) {
    //         return null;
    //     }

    //     // Find our view by Iterating on our default view:
    //     for (const thisChildView of this.views[this.defaultView].children) {
    //         if (
    //             (thisChildView.modelName == 'GMLFolder' || thisChildView.modelName == 'GMFolder') &&
    //             thisChildView.folderName == viewType
    //         ) {
    //             return thisChildView;
    //         }
    //     }

    //     return null;
    // }

    private searchViewsForUUID(targetNodeUUID: string, startingNode?: GMResourcePlus): GMResourcePlus | null {
        // Default Node:
        startingNode = startingNode || this.views[this.defaultView];

        if (startingNode.id == targetNodeUUID) {
            return startingNode;
        } else if (startingNode.modelName == 'GMLFolder' && startingNode.children != null) {
            let result: GMResourcePlus | null = null;

            for (let i = 0, l = startingNode.children.length; result == null && i < l; i++) {
                const thisChildNode = startingNode.children[i];
                result = this.searchViewsForUUID(targetNodeUUID, thisChildNode);
            }
            return result;
        }
        return null;
    }

    public async viewsDeleteViewAtNode(childUUID: string) {
        // Splice out the View from the Parent
        const parentNode = await this.viewsGetParentView(childUUID, this.views[this.defaultView]);
        if (!parentNode || parentNode.modelName !== 'GMLFolder') return false;

        const childNode = this.searchViewsForUUID(childUUID);
        if (!childNode || childNode.modelName === 'GMLFolder') return false;

        // Splice!
        const thisIndex = parentNode.children.findIndex(thisChild => {
            return thisChild.id === childNode.id;
        });
        if (thisIndex === -1) return false;

        parentNode.children.splice(thisIndex, 1);
        return true;
    }

    /**
     * Returns the parent of the UUID given.
     */
    private viewsGetParentView(targetNodeUUID: string, defaultNode: GMResourcePlus, parentNode?: GMResourcePlus): GMResourcePlus | null {
        if (defaultNode.id === targetNodeUUID && parentNode) {
            return parentNode;
        } else if (defaultNode.modelName == 'GMLFolder' && defaultNode.children != null) {
            let result: GMResourcePlus | null = null;

            for (let i = 0, l = defaultNode.children.length; result == null && i < l; i++) {
                const thisChildNode = defaultNode.children[i];
                result = this.viewsGetParentView(targetNodeUUID, thisChildNode, defaultNode);
            }
            return result;
        }
        return null;
    }

    private makePrettyFileNames(fn: string): string {
        // Special Case:
        switch (fn) {
            case 'tilesets':
                return 'Tile Sets';
            case 'datafiles':
                return 'Included Files';
            case 'configs':
                return 'Configurations';
        }

        // Other Basic Folder Names:
        const checkArray = [
            'sprites',
            'sounds',
            'paths',
            'scripts',
            'shaders',
            'fonts',
            'timelines',
            'objects',
            'rooms',
            'notes',
            'extensions',
            'options'
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
     * Checks if the manual is cached or not. It
     * is safe to run without knowing if the cache
     * exists yet.
     * @param fileName The name and extension of the file to
     * check for. Example: "gmlDocs.json"
     */
    public async isFileCached(fileName: string): Promise<boolean> {
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
        return await fse.readFile(path.join(this.projectDirectory, '.gml-tools', fileName), encoding);
    }

    /**
     * Set cached file with a string. Will write over any other data.
     * @param fileName Filename to create.
     * @param textToSave Text to save, encoded as 'utf8'
     */
    public async setCachedFileText(fileName: string, textToSave: string) {
        await fse.writeFile(path.join(this.projectDirectory, '.gml-tools', fileName), textToSave, 'utf8');
    }

    public async deletedCachedFile(fileName: string) {
        await fse.unlink(path.join(this.projectDirectory, '.gml-tools', fileName));
    }

    public async deleteCache() {
        await fse.rmdir(path.join(this.projectDirectory, '.gml-tools'));
    }

    public async initProjDocs(dirname: string) {
        // Create the Actual File:
        this.setCachedFileText(
            'project-documentation.json',
            JSON.stringify(
                {
                    $schema: URI.file(path.join(dirname, path.normalize('../lib/schema/gmlDocsSchema.json'))).toString(),
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
        const fpath = path.join(this.projectDirectory, '.gml-tools', 'project-documentation.json');
        const ourDocsWatch = chokidar.watch(fpath);

        // Creat our JSON validator:
        const ajv = new Ajv();
        // On Mac and Linux, ajv has the schema for draft 6, and on Windows, it doesn't.
        // Very strange behavior.
        let check;
        try {
            check = ajv.getSchema('http://json-schema.org/draft-06/schema');
        } catch (error) {}
        if (!check) {
            ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));
        }
        const schemaPath = path.join(dirname, path.normalize('../lib/schema/gmlDocsSchema.json'));
        const validator = ajv.compile(JSON.parse(await fse.readFile(schemaPath, 'utf-8')));

        // Add in one change:
        let ourJSON: any;
        try {
            ourJSON = JSON.parse(await fse.readFile(fpath, 'utf8'));
        } catch (err) {
            console.log(err);
        }
        const isValid = await validator(ourJSON);

        if (!isValid) return;
        this.reference.docsClearSecondaryDocs();
        this.reference.initDocsAddSecondaryDocs(ourJSON);

        ourDocsWatch.on('all', async (someEvent, somePath, someStats) => {
            switch (someEvent) {
                case 'change':
                    let ourJSON: any;
                    try {
                        ourJSON = JSON.parse(await fse.readFile(somePath, 'utf8'));
                    } catch (err) {
                        console.log(err);
                        break;
                    }
                    const isValid = await validator(ourJSON);

                    if (!isValid) return;
                    this.reference.docsClearSecondaryDocs();
                    this.reference.initDocsAddSecondaryDocs(ourJSON);
                    break;

                default:
                    console.log('Altered docs...');
                    break;
            }
        });
    }
    //#endregion

    //#region Diagnostic Handler Methods
    private createDiagnosticHandler(fileURI: string) {
        return new DiagnosticHandler(this.grammar, fileURI, this.reference);
    }

    public async getDiagnosticHandler(uri: string): Promise<DiagnosticHandler> {
        const thisDiag = this.documents[uri].diagnosticHandler;

        if (!thisDiag) {
            const thisDiagnosticHandle = this.createDiagnosticHandler(uri);
            this.documents[uri].diagnosticHandler = thisDiagnosticHandle;
            return thisDiagnosticHandle;
        } else return thisDiag;
    }
    //#endregion

    //#region Document Handlers
    // private async createDocumentFolder(path: string, name: string, type: BasicResourceType, eventEntry?: EventInfo) {
    //     let uri = URI.file(path).toString();

    //     const thisDocFolder: DocumentFolder = {
    //         name: name,
    //         type: type,
    //         file: '',
    //         diagnosticHandler: null
    //     };

    //     if (eventEntry) {
    //         thisDocFolder.eventInfo = eventEntry;
    //     }

    //     this.documents[uri] = thisDocFolder;
    // }

    public async getDocumentFolder(uri: string): Promise<DocumentFolder | undefined> {
        return this.documents[uri];
    }

    public async addDocument(uri: string, file: string): Promise<DocumentFolder | null> {
        const thisFileFolder = this.documents[uri];
        if (thisFileFolder) {
            thisFileFolder.fileFullText = file;
            return thisFileFolder;
        } else {
            console.log('Document:' + uri + " doesn't exist!");
            return null;
        }
    }

    private removeDocumentFolder(uri: string) {
        delete this.documents[uri];
    }

    private async documentCreateDocumentFolder(path: string, name: string, type: BasicResourceType, eventEntry?: EventInfo) {
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
    //#endregion

    //#region Open Document Methods
    public async addOpenDocument(uri: string) {
        this.openedDocuments.push(uri);
        console.log('Added ' + uri);
    }

    public async isOpenDocument(uri: string) {
        return this.openedDocuments.includes(uri);
    }

    public async closeOpenDocument(thisURI: string) {
        // Close the Open Document
        const indexNumber = this.openedDocuments.indexOf(thisURI);
        if (indexNumber === -1) {
            console.log('Error -- attempting to close a document \n which is not open. \n Make sure you are opening them properly.');
        }
        this.openedDocuments.splice(indexNumber, 1);

        // Hash the document
        const thisDocInfo = await this.getDocumentFolder(thisURI);
        if (!thisDocInfo) {
            console.log(`Document folder does not exist for ${thisURI}`);
            return;
        }
        const ourHasher = crypto.createHash('sha1');
        const thisHash = ourHasher.update(thisDocInfo.fileFullText).digest('hex');
        this.reference.URISetHash(thisURI, thisHash);
    }

    //#endregion

    //#region Create Resources
    public async resourceScriptCreate(scriptName: string, createAtNode: string): Promise<ClientViewNode | null> {
        // Kill without YYP
        if (!this.projectYYP) return null;

        // Protect us
        this.currentlyCreatingResources = true;

        // Generate the new Script:
        const newScript: Resource.Script = {
            name: scriptName,
            mvc: '1.0',
            modelName: 'GMScript',
            id: uuidv4(),
            IsDnD: false,
            IsCompatibility: false
        };

        // Create our "scripts" folder if necessary:
        if (this.topLevelDirectories.includes('scripts') == false) {
            await fse.mkdir(path.join(this.projectDirectory, 'scripts'));
        }
        // Create Files
        const ourDirectoryPath = path.join(this.projectDirectory, 'scripts', scriptName);
        await fse.mkdir(ourDirectoryPath);
        const ourGMLPath = path.join(ourDirectoryPath, scriptName + '.gml');
        await fse.writeFile(ourGMLPath, '');
        const ourYYPath = path.join(ourDirectoryPath, scriptName + '.yy');
        await fse.writeFile(ourYYPath, JSON.stringify(newScript), 'utf8');

        // Add to the script order:
        if (this.projectYYP.script_order) {
            this.projectYYP.script_order.push(newScript.id);
        }
        // Add as a YYP resource:
        const rPath = path.join('scripts', scriptName, scriptName + '.yy');
        this.projectYYP.resources.push(this.createYYPResourceEntry(newScript.id, rPath, newScript.modelName));

        // Update Views:
        await this.viewsInsertViewsAtNode(createAtNode, [newScript]);
        // Save the YYP
        await this.saveYYP();

        // Update internal model
        await this.resourceScriptAddToInternalModel(newScript.name, ourGMLPath, newScript);

        const ourViewNode = this.searchViewsForUUID(newScript.id);
        if (!ourViewNode) return null;

        // Protect us
        this.currentlyCreatingResources = false;

        return {
            id: ourViewNode.id,
            modelName: ourViewNode.modelName,
            name: ourViewNode.name,
            fpath: ourGMLPath,
            filterType: ourViewNode.modelName
        };
    }

    private async resourceScriptAddToInternalModel(scriptName: string, gmlFilePath: string, thisYYFile: Resource.Script) {
        const URIstring = URI.file(gmlFilePath).toString();
        this.reference.addResource(scriptName, 'GMScript');
        this.reference.scriptSetURI(scriptName, URIstring);
        await this.documentCreateDocumentFolder(gmlFilePath, scriptName, 'GMScript');

        this.projectResources[thisYYFile.id] = thisYYFile;

        // Set an empty hash (we save this to just save our time)
        this.reference.URISetHash(URIstring, this.emptySHA1Hash);
    }

    public async resourceScriptDelete(scriptPack: IScript, viewUUID: string) {
        try {
            // Early exist
            if (!this.projectYYP) return;

            // Get our name
            const docFolder = await this.getDocumentFolder(scriptPack.uri);
            if (!docFolder) return false;
            const scriptName = docFolder.name;

            // Kill the folder
            fse.remove(path.join(this.projectDirectory, 'scripts', scriptName));

            // Edit the YYP
            const ourResourceIndex = this.projectYYP.resources.findIndex(thisResource => {
                return thisResource.Key === viewUUID;
            });
            if (ourResourceIndex === -1) return false;
            this.projectYYP.resources.splice(ourResourceIndex, 1);

            await this.saveYYP();

            // Kill our Document Folder
            this.removeDocumentFolder(scriptPack.uri);
        } catch (e) {
            return false;
        }

        return true;
    }

    public async resourceObjectCreate(objPackage: ResourcePackage): Promise<ClientViewNode | null> {
        // Kill without YYP
        if (!this.projectYYP) return null;

        // Our New Object
        const newObject: Resource.Object = {
            id: uuidv4(),
            modelName: 'GMObject',
            mvc: '1.0',
            name: objPackage.resourceName,
            maskSpriteId: '00000000-0000-0000-0000-000000000000',
            overriddenProperties: null,
            properties: null,
            parentObjectId: '00000000-0000-0000-0000-000000000000',
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
            spriteId: '00000000-0000-0000-0000-000000000000',
            visible: true,
            eventList: []
        };

        // Create our "Objects" folder if necessary
        const ourDirectoryPath = path.join(this.projectDirectory, 'objects', objPackage.resourceName);
        if (this.topLevelDirectories.includes('objects') == false) {
            await fse.mkdir(path.join(this.projectDirectory, 'objects'));
        }

        // Actual Directory/File Creation
        await fse.mkdir(ourDirectoryPath);
        const ourYYPath = path.join(ourDirectoryPath, objPackage.resourceName + '.yy');
        await fse.writeFile(ourYYPath, JSON.stringify(newObject), 'utf8');

        // Create our YYP Resource.
        const rPath = path.join('objects', objPackage.resourceName, objPackage.resourceName + '.yy');
        this.projectYYP.resources.push(this.createYYPResourceEntry(newObject.id, rPath, newObject.modelName));

        // Update Views:
        await this.viewsInsertViewsAtNode(objPackage.viewUUID, [newObject]);
        // Save the YYP
        await this.saveYYP();

        // Update Our Interal Model:
        this.reference.addResource(newObject.name, newObject.modelName);
        this.projectResources[newObject.id] = newObject;

        const ourViewNode = this.searchViewsForUUID(newObject.id);
        if (!ourViewNode) return null;

        return {
            id: ourViewNode.id,
            modelName: ourViewNode.modelName,
            name: ourViewNode.name,
            fpath: ourYYPath,
            filterType: ourViewNode.modelName
        };
    }

    public async resourceAddEvents(eventsPackage: ResourcePackage) {
        const thisObj = this.projectResources[eventsPackage.viewUUID];
        if (!thisObj || thisObj.modelName !== 'GMObject') return null;

        // This is how we get a return path to go to:
        let returnPath: string = '';

        // Create the files and update our Internal YY files
        const newEvent = await this.createEvent(eventsPackage.resourceName, eventsPackage.viewUUID);
        if (newEvent) {
            const fpath = this.convertEventEnumToFPath(newEvent, path.join());
            if (returnPath === null) {
                returnPath = fpath;
            }

            // Make sure not a duplicate:
            for (const pastEvent of thisObj.events) {
                if (pastEvent.eventNumb == newEvent.enumb && pastEvent.eventType == newEvent.eventtype) {
                    this.lsp.connection.window.showWarningMessage('Attempted to create event which already exists. Event not created.');
                    continue;
                }
            }

            // Push to Object Events
            thisObj.events.push({
                eventNumb: newEvent.enumb,
                eventType: newEvent.eventtype
            });
            thisObj.yyFile.eventList.push(newEvent);

            await fse.writeFile(fpath, '');

            await this.createDocumentFolder(fpath, thisObj.yyFile.name, 'GMObject');
            await this.initialDiagnostics(fpath, SemanticsOption.Function | SemanticsOption.Variable);
        }

        // Rewrite our event.yy file:
        await fse.writeFile(path.join(thisObj.directoryFilepath, thisObj.yyFile.name + '.yy'), JSON.stringify(thisObj.yyFile, null, 4));

        return returnPath;
    }

    private async createEvent(eventName: string, ownerUUID: string): Promise<Resource.ObjectEvent | null> {
        const eventObj = await this.convertStringToEventType(eventName);
        if (eventObj) {
            return {
                id: uuidv4(),
                modelName: 'GMEvent',
                mvc: '1.0',
                IsDnD: false,
                collisionObjectId: '00000000-0000-0000-0000-000000000000',
                enumb: eventObj.eventNumb,
                eventtype: eventObj.eventType,
                m_owner: ownerUUID
            };
        } else return null;
    }

    public async saveYYP() {
        await fse.writeFile(this.projectYYPPath, JSON.stringify(this.projectYYP), 'utf8');
    }

    public async validateYYP(): Promise<boolean> {
        const currentYYPString = JSON.stringify(JSON.parse(await fse.readFile(this.projectYYPPath, 'utf8')));
        return currentYYPString === JSON.stringify(this.projectYYP);
    }

    /**
     * Creates and return a YYPResource.
     * @param resourceID The UUID of the resource to create.
     * @param resourcePath The filepath, relative to YYP, of the resource.
     * @param resourceType A string, such as "GMScript" or "GMObject".
     */
    private createYYPResourceEntry(resourceID: string, rPath: string, rType: Resource.ModelNames): YYPResource {
        return {
            Key: resourceID,
            Value: {
                id: uuidv4(),
                modelName: 'GMResourceInfo',
                mvc: '1.0',
                configDeltaFiles: [],
                configDeltas: [],
                resourceCreationConfigs: ['default'],
                resourcePath: rPath,
                resourceType: rType
            }
        };
    }

    // public async createView(fName: string, parentUUID?: string) {
    //     parentUUID = parentUUID || this.views[this.defaultView].id;

    //     // Get our Parent so we can get a FilterType:
    //     const thisParentNode = this.searchViewsForUUID(parentUUID);
    //     if (!thisParentNode || thisParentNode.modelName != 'GMLFolder') return null;
    //     const newFilterType = thisParentNode.filterType == 'root' ? '' : thisParentNode.filterType;

    //     // Get our ID:
    //     const ourUUID = uuidv4();

    //     // Create *this* view first:
    //     const ourNewView: Resource.GMFolder = {
    //         children: [],
    //         filterType: newFilterType,
    //         folderName: fName,
    //         id: ourUUID,
    //         isDefaultView: false,
    //         localisedFolderName: '',
    //         mvc: '1.1',
    //         modelName: 'GMFolder',
    //         name: ourUUID
    //     };

    //     // Create view file:
    //     const fp = path.join(this.projectDirectory, 'views', ourNewView.id + '.yy');
    //     try {
    //         await fse.writeFile(fp, JSON.stringify(ourNewView, null, 4));
    //     } catch (err) {
    //         console.log("View '" + ourNewView.folderName + "' not created.");
    //         console.log(err);
    //         return null;
    //     }

    //     return ourNewView;
    // }

    private convertEventEnumToFPath(thisEvent: Resource.ObjectEvent, dirPath: string): string {
        switch (thisEvent.eventtype) {
            case EventType.Create:
                return path.join(dirPath, 'Create_0.gml');
            case EventType.Alarm:
                return path.join(dirPath, 'Alarm_' + thisEvent.enumb.toString() + '.gml');
            case EventType.Destroy:
                return path.join(dirPath, 'Destroy_0.gml');
            case EventType.Step:
                return path.join(dirPath, 'Step_' + thisEvent.enumb.toString() + '.gml');
            case EventType.Collision:
                return path.join(dirPath, 'Collision_' + thisEvent.id + '.gml');
            case EventType.Keyboard:
                return path.join(dirPath, 'Keyboard_' + thisEvent.enumb.toString() + '.gml');
            case EventType.Mouse:
                return path.join(dirPath, 'Mouse_' + thisEvent.enumb.toString() + '.gml');
            case EventType.Other:
                return path.join(dirPath, 'Other_' + thisEvent.enumb.toString() + '.gml');
            case EventType.Draw:
                return path.join(dirPath, 'Draw_' + thisEvent.enumb.toString() + '.gml');
            case EventType.KeyPress:
                return path.join(dirPath, 'KeyPress_' + thisEvent.enumb.toString() + '.gml');
            case EventType.KeyRelease:
                return path.join(dirPath, 'KeyRelease_' + thisEvent.enumb.toString() + '.gml');
            case EventType.Trigger:
                console.log('We got a Trigger event here. Somehow this project is from GM8?');
                return path.join(dirPath, 'Trigger_' + thisEvent.enumb.toString() + '.gml');
            case EventType.CleanUp:
                return path.join(dirPath, 'CleanUp_0.gml');
            case EventType.Gesture:
                return path.join(dirPath, 'Gesture_' + thisEvent.enumb.toString() + '.gml');
        }
        console.log(
            'NonGML file indexed by YYP? Serious error. \n' +
                'This event: ' +
                thisEvent.eventtype +
                '/' +
                thisEvent.enumb +
                '\n' +
                'This directory: ' +
                dirPath
        );
        return '';
    }

    private convertEventEnumToName(thisEvent: Resource.ObjectEvent): string {
        switch (thisEvent.eventtype) {
            case EventType.Alarm:
                return 'Alarm ' + thisEvent.enumb;
            case EventType.CleanUp:
                return 'Clean Up';
            case EventType.Collision:
                return 'Collision -- ' + thisEvent.collisionObjectId;
            case EventType.Create:
                return 'Create';
            case EventType.Destroy:
                return 'Destroy';
            case EventType.Draw:
                switch (thisEvent.enumb) {
                    case EventNumber.DrawNormal:
                        return 'Draw';
                    case EventNumber.Gui:
                        return 'Draw GUI';
                    case EventNumber.DrawBegin:
                        return 'Draw Begin';
                    case EventNumber.DrawEnd:
                        return 'Draw End';
                    case EventNumber.GuiBegin:
                        return 'Draw GUI Begin';
                    case EventNumber.GuiEnd:
                        return 'Draw GUI End';
                    case EventNumber.DrawPre:
                        return 'Pre-Draw';
                    case EventNumber.DrawPost:
                        return 'Post-Draw';
                    case EventNumber.WindowResize:
                        return 'Window Resize';
                    default:
                        return '';
                }
            case EventType.Gesture:
                return 'Gesture Event ' + thisEvent.enumb;
            case EventType.Keyboard:
                return 'Key Down Event ' + thisEvent.enumb;
            case EventType.KeyPress:
                return 'Key Press Event ' + thisEvent.enumb;
            case EventType.KeyRelease:
                return 'Key Up Event ' + thisEvent.enumb;
            case EventType.Mouse:
                return 'Mouse Event ' + thisEvent.enumb;
            case EventType.Other:
                // User Events
                if (thisEvent.enumb >= EventNumber.User0 && thisEvent.enumb <= EventNumber.User15) {
                    return 'User Event ' + (thisEvent.enumb - 10);
                }

                // Async
                switch (thisEvent.enumb) {
                    case EventNumber.AsyncAudioPlayBack:
                        return 'Async - Audio Playback';
                    case EventNumber.AsyncAudioRecording:
                        return 'Async - Audio Recording';
                    case EventNumber.AsyncCloud:
                        return 'Async - Cloud';
                    
                    case EventNumber.AsyncDialog:
                        return 'Async - Dialog';
                    case EventNumber.AsyncHTTP:
                        return 'Async - HTTP';
                    case EventNumber.AsyncImageLoaded:
                        return 'Async - Image Loaded';
                    case EventNumber.AsyncInAppPurchase:
                        return 'Async - In-App Purchase';
                    case EventNumber.AsyncNetworking:
                        return 'Async - Networking';
                    case EventNumber.AsyncPushNotification:
                        return 'Async - Push Notification';
                    case EventNumber.AsyncSaveLoad:
                        return 'Async - Save/Load';
                    case EventNumber.AsyncSocial:
                        return 'Async - Social';
                    case EventNumber.AsyncSteam:
                        return 'Async - Steam';
                    case EventNumber.AsyncSystem:
                        return 'Async - System';
                }
                return 'Other Event ' + thisEvent.enumb;

            case EventType.Step:
                switch (thisEvent.enumb) {
                    case EventNumber.StepBegin:
                        return 'Begin Step';
                    case EventNumber.StepEnd:
                        return 'End Step';
                    case EventNumber.StepNormal:
                        return 'Step';
                }
                return '';
            case EventType.Trigger:
                return 'Trigger Event ' + thisEvent.enumb;
        }
    }

    private convertStringToEventType(evName: string): EventInfo | null {
        switch (evName) {
            case 'Create':
                return {
                    eventType: EventType.Create,
                    eventNumb: EventNumber.Create
                };

            case 'Step':
                return {
                    eventType: EventType.Step,
                    eventNumb: EventNumber.StepNormal
                };

            case 'Begin Step':
                return {
                    eventNumb: EventNumber.StepBegin,
                    eventType: EventType.Step
                };

            case 'End Step':
                return {
                    eventNumb: EventNumber.StepEnd,
                    eventType: EventType.Step
                };

            case 'Draw':
                return {
                    eventNumb: EventNumber.DrawNormal,
                    eventType: EventType.Draw
                };

            case 'Draw GUI':
                return {
                    eventNumb: EventNumber.Gui,
                    eventType: EventType.Draw
                };

            case 'Draw Begin':
                return {
                    eventNumb: EventNumber.DrawBegin,
                    eventType: EventType.Draw
                };

            case 'Draw End':
                return {
                    eventNumb: EventNumber.DrawEnd,
                    eventType: EventType.Draw
                };

            case 'Draw GUI Begin':
                return {
                    eventNumb: EventNumber.GuiBegin,
                    eventType: EventType.Draw
                };

            case 'Draw GUI End':
                return {
                    eventNumb: EventNumber.GuiEnd,
                    eventType: EventType.Draw
                };

            case 'Pre-Draw':
                return {
                    eventNumb: EventNumber.DrawPre,
                    eventType: EventType.Draw
                };

            case 'Post-Draw':
                return {
                    eventNumb: EventNumber.DrawPost,
                    eventType: EventType.Draw
                };

            case 'Destroy':
                return {
                    eventNumb: EventNumber.Create,
                    eventType: EventType.Destroy
                };

            case 'Cleanup':
                return {
                    eventNumb: EventNumber.Create,
                    eventType: EventType.CleanUp
                };

            case 'Audio Playback':
                return {
                    eventNumb: EventNumber.AsyncAudioPlayBack,
                    eventType: EventType.Other
                };

            case 'Audio Recording':
                return {
                    eventNumb: EventNumber.AsyncAudioRecording,
                    eventType: EventType.Other
                };

            case 'Cloud':
                return {
                    eventNumb: EventNumber.AsyncCloud,
                    eventType: EventType.Other
                };

            case 'Dialog':
                return {
                    eventNumb: EventNumber.AsyncDialog,
                    eventType: EventType.Other
                };

            case 'HTTP':
                return {
                    eventNumb: EventNumber.AsyncHTTP,
                    eventType: EventType.Other
                };

            case 'In-App Purchase':
                return {
                    eventNumb: EventNumber.AsyncInAppPurchase,
                    eventType: EventType.Other
                };

            case 'Image Loaded':
                return {
                    eventNumb: EventNumber.AsyncImageLoaded,
                    eventType: EventType.Other
                };

            case 'Networking':
                return {
                    eventNumb: EventNumber.AsyncNetworking,
                    eventType: EventType.Other
                };

            case 'Push Notification':
                return {
                    eventNumb: EventNumber.AsyncPushNotification,
                    eventType: EventType.Other
                };

            case 'Save/Load':
                return {
                    eventNumb: EventNumber.AsyncSaveLoad,
                    eventType: EventType.Other
                };

            case 'Social':
                return {
                    eventNumb: EventNumber.AsyncSocial,
                    eventType: EventType.Other
                };

            case 'Steam':
                return {
                    eventNumb: EventNumber.AsyncSteam,
                    eventType: EventType.Other
                };

            case 'System':
                return {
                    eventNumb: EventNumber.AsyncSystem,
                    eventType: EventType.Other
                };

            default:
                // We do all enumerated events here:
                if (evName.includes('Alarm - ')) {
                    const thisRegexMatch = evName.match(/\d+/);
                    if (!thisRegexMatch) return null;
                    const alarmNumber = Number.parseInt(thisRegexMatch[0]);

                    // @ts-ignore
                    // TS wants alarmNumber to an EventNumber, but making the for loop would be ghastly. So we ignore this error and enjoy our lives.
                    return { eventNumb: alarmNumber, eventType: EventType.Alarm };
                }

                if (evName.includes('User Event - ')) {
                    const thisRegexMatch = evName.match(/\d+/);
                    if (!thisRegexMatch) return null;
                    const alarmNumber = Number.parseInt(thisRegexMatch[0]);

                    // @ts-ignore Same as above -- this is easier.
                    return {
                        eventNumb: EventNumber.User0 + alarmNumber,
                        eventType: EventType.Alarm
                    };
                }

                return null;
        }
    }

    private createFPFromBase(thisResource: GMResourcePlus): string {
        const resourcePath = this.modelNameToFileName(thisResource.modelName);

        let relativePath: string;
        // Create paths to the best case GML we've got:
        switch (resourcePath) {
            case 'views':
                relativePath = path.join(resourcePath, thisResource.name + '.yy');
                break;
            case 'notes':
                relativePath = path.join(resourcePath, thisResource.name + '.txt');
                break;
            case 'scripts':
                relativePath = path.join(resourcePath, thisResource.name, thisResource.name + '.gml');
                break;
            case 'sprites':
                relativePath = path.join(resourcePath, thisResource.name);
                break;
            case 'shaders':
                relativePath = path.join(resourcePath, thisResource.name);
                break;
            case 'objects':
                relativePath = path.join(resourcePath, thisResource.name);
                break;

            default:
                relativePath = path.join(resourcePath, thisResource.name, thisResource.name + '.yy');
                break;
        }

        return path.join(this.projectDirectory, relativePath);
    }

    private modelNameToFileName(mName: string): ResourceNames {
        const ourMap: { [somestring: string]: ResourceNames } = {
            GMObject: 'objects',
            GMRoom: 'rooms',
            GMSprite: 'sprites',
            GMSound: 'sounds',
            GMPath: 'paths',
            GMFolder: 'views',
            GMLFolder: 'views',
            GMScript: 'scripts',
            GMFont: 'fonts',
            GMTimeline: 'timelines',
            GMTileSet: 'tilesets',
            GMNotes: 'notes',
            GMExtension: 'extensions',
            GMShader: 'shaders',
            GMIncludedFile: 'datafiles_yy'
        };

        return ourMap[mName];
    }
    //#endregion

    //#region Compile
    public compile(type: 'test' | 'zip' | 'installer', yyc: boolean, output: string = '') {
        const build = rubber.windows({
            projectPath: this.projectYYPPath,
            build: type,
            outputPath: output,
            yyc
        });
        this.lsp.connection.sendNotification('compile.started');
        build.on('compileStatus', data => {
            this.lsp.connection.sendNotification('compile.status', data);
        });
        build.on('gameStatus', data => {
            this.lsp.connection.sendNotification('compile.status', data);
        });
        build.on('allFinished', () => {
            this.lsp.connection.sendNotification('compile.finished');
        });
    }

    // #endregion

    //#region Watcher
    private async installProjectYYPWatcher() {
        // Objects are gonne be SO FUN
        // const objectWatcher = chokidar.watch('script/**/*.yy');

        // YYP Stuff
        const yypWatch = chokidar.watch(this.projectYYPPath, {
            awaitWriteFinish: true,
            atomic: 1000,
            ignoreInitial: true
        });
        yypWatch.on('change', async (event: string, fname: string) => {
            const newYYP: YYP = JSON.parse(await fse.readFile(this.projectYYPPath, 'utf8'));
            // If we don't have a YYP or we're currently creating resources, dump this.
            if (!this.projectYYP || this.currentlyCreatingResources) {
                return;
            }

            const currentResources = this.projectYYP.resources;
            const subtractedResources: YYPResource[] = [];
            const addedResources: YYPResource[] = [];

            /**
             * *    The PLAN:
             * *
             * * 1. We cycle through all our old resources, checking if they exist
             * *    on the new resources coming in. If they don't we add them to
             * *    the "subtracted" array. Otherwise, we do nothing.
             *
             * * 2. We cycle through all our new resources, checking if they exist
             * *    on the new resources coming in. If they don't, we add them to
             * *    the "addition" array. Otherwise, we do nothing.
             *
             * * 3. Go through our subtracted resources and deal with them.
             */

            // ! Step 1
            for (const thisOldResource of currentResources) {
                const possibleFound = newYYP.resources.find(thisResource => {
                    return thisResource.Key === thisOldResource.Key;
                });
                if (possibleFound === undefined) subtractedResources.push(thisOldResource);
            }

            // ! Step 2
            for (const thisNewResource of newYYP.resources) {
                const possibleFound = currentResources.find(thisResource => {
                    return thisResource.Key === thisNewResource.Key;
                });
                if (possibleFound === undefined) addedResources.push(thisNewResource);
            }

            // ! Step 3
            for (const thisSubtractedResource of subtractedResources) {
                switch (thisSubtractedResource.Value.resourceType) {
                    case 'GMScript':
                        const name = path.basename(thisSubtractedResource.Value.resourcePath, '.yy');
                        this.reference.scriptDelete(name);
                        break;

                    case 'GMObject':
                        // We ignore objects since we handle them on their own since they're stupid.
                        console.log('Object Added.');
                        break;

                    case 'GMFolder':
                        // Worrisome!
                        break;

                    default:
                        // This is a type filter. In a better world, this wouldn't be here:
                        const rType = thisSubtractedResource.Value.resourceType;
                        if (
                            rType === 'GMExtension' ||
                            rType === 'GMExtensionFile' ||
                            rType === 'GMExtensionFunction' ||
                            rType === 'GMExtensionConstant' ||
                            rType === 'GMOption'
                        )
                            continue;

                        const resourceName = path.basename(thisSubtractedResource.Value.resourcePath, '.yy');

                        this.reference.deleteResource(resourceName);
                        delete this.projectResources[thisSubtractedResource.Key];
                        break;
                }
            }

            for (const thisAddedResource of addedResources) {
                const yyFile = JSON.parse(
                    await fse.readFile(path.join(this.projectDirectory, thisAddedResource.Value.resourcePath), 'utf8')
                );

                switch (thisAddedResource.Value.resourceType) {
                    case 'GMScript':
                        const scriptName = path.basename(thisAddedResource.Value.resourcePath, '.yy');
                        const gmlPath = path.join(this.projectDirectory, 'scripts', scriptName, scriptName + '.gml');

                        await this.resourceScriptAddToInternalModel(scriptName, gmlPath, yyFile);
                        console.log('Script Added' + scriptName);
                        break;

                    case 'GMObject':
                        // We ignore objects since we handle them on their own since they're stupid.
                        break;

                    case 'GMFolder':
                        break;

                    default:
                        // This is a type filter. In a better world, this wouldn't be here:
                        const rType = thisAddedResource.Value.resourceType;
                        if (
                            rType === 'GMExtension' ||
                            rType === 'GMExtensionFile' ||
                            rType === 'GMExtensionFunction' ||
                            rType === 'GMExtensionConstant' ||
                            rType === 'GMOption'
                        )
                            continue;

                        const resourceName = path.basename(thisAddedResource.Value.resourcePath, '.yy');

                        this.reference.addResource(resourceName, rType);
                        this.projectResources[yyFile.id] = yyFile;
                        break;
                }
            }

            // Reparse our Views
            this.views[this.defaultView] = await this.walkViewTree(this.rootViews[this.defaultView]);
            this.lsp.updateViews();
        });

        // Object Watcher
        const globPattern = 'objects/**/*.yy';
        const objectWatch = chokidar.watch(globPattern, {
            awaitWriteFinish: true,
            atomic: 1000,
            ignoreInitial: true,
            cwd: path.join(this.projectDirectory)
        });
        objectWatch.on('change', async (fname: string) => {
            console.log('Object changed!');
        });

        objectWatch.on('add', async (fname: string) => {
            console.log('Added Object!');
        });

        // View Watch
        const viewWatch = chokidar.watch(path.join(this.projectDirectory, 'views'), {
            awaitWriteFinish: true,
            atomic: 1000,
            ignoreInitial: true
        });
        viewWatch.on('change', async (fname: string) => {
            const thisView: Resource.GMFolder = JSON.parse(await fse.readFile(fname, 'utf8'));
            this.projectResources[thisView.id] = thisView;
        });
    }

    public async deleteResources(resourceToDelete: YYPResource) {
        // Clear the basic resource
    }
    //#endregion
}
