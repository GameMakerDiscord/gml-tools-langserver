import { Reference, GenericResourceDescription } from './reference';
import { WorkspaceFolder } from 'vscode-languageserver';
import URI from 'vscode-uri';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as upath from 'upath';
import { YYP, Resource, EventType } from 'yyp-typings';
import { IURIRecord, IObjects, IScriptsAndFunctions, IEnum, IMacro } from './declarations';

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

export class InitialStartup {
    reference: Reference;
    projectDirectory: string;
    topLevelDirectories: string[];
    projectYYP: YYP | null;
    projectYYPPath: string;
    projectCache: ProjectCache.Cache;
    ourHash: crypto.Hash;

    constructor(ref: Reference) {
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

        // Reference
        this.reference = ref;

        // Tools
        this.ourHash = crypto.createHash('sha1');
    }

    public async initialWorkspaceFolders(workspaceFolder: WorkspaceFolder[]) {
        // Save our Project Directory
        this.projectDirectory = URI.parse(workspaceFolder[0].uri).fsPath;

        // Get our Directories
        this.topLevelDirectories = await fse.readdir(this.projectDirectory);

        // Get our YYPs
        const possibleYYPs: string[] = this.topLevelDirectories.filter((thisFile) => {
            path.extname(thisFile) === '.yyp';
        });

        // Sort our Dinguses
        if (possibleYYPs.length !== 1) return;

        // Set our YYP
        this.projectYYPPath = possibleYYPs[0];

        // Load our Project Cache if it's there:
        let cachedFileNames: string[] = [];
        if (this.topLevelDirectories.includes('.gml-tools')) {
            cachedFileNames = await fse.readdir(path.join(this.projectDirectory, '.gml-tools'));
        } else {
            await fse.mkdir(path.join(path.join(this.projectDirectory, '.gml-tools')));
        }

        const projectCache = cachedFileNames.filter((thisFile) => {
            thisFile == 'project-cache.json';
        });

        if (projectCache.length === 0) {
            return;
        }

        this.initialIndexProject(path.join(this.projectDirectory, '.gml-tools', projectCache[0]));
    }

    private async initialIndexProject(projCacheFPath: string) {
        // Get our Project Cache and Self-Validate
        this.projectCache = JSON.parse(await fse.readFile(projCacheFPath, 'utf8'));

        // Get our YYP
        const rawYYP = await fse.readFile(this.projectYYPPath, 'utf8');
        this.projectYYP = JSON.parse(rawYYP);
        if (!this.projectYYP) return;

        /**
         * * General overview of how we parse the YYP:
         *
         * * 1. If the YYP isn't the exact same, we do a first pass on each YY and GML
         * *    file referenced by the YYP, filling in resource names and parentage.
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
         * * 5. We pass our YYP off to the langserv, which passes it to the FS. And, we outie!
         */

        // ! Step Zero: Dump the Reference from the Cache
        this.reference.dumpCachedData(this.projectCache.CachedReference);

        // ! Step One: Index the YYP Resources, so we have all resource names:
        const projectYYs: Resource.GMResource[] = [];
        for (const thisResource of this.projectYYP.resources) {
            let yyFile: Resource.GMResource;
            try {
                yyFile = JSON.parse(
                    await fse.readFile(
                        path.join(this.projectDirectory, upath.toUnix(thisResource.Value.resourcePath)),
                        'utf8'
                    )
                );
            } catch (e) {
                continue;
            }
            await this.initialParseYYFile(yyFile);

            projectYYs.push(yyFile);
        }

        // ! Step Two: Make a queue of all the GML files in the project:
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
            const fileBuffer = await fse.readFile(thisFPath);
            const thisHash = this.ourHash.update(fileBuffer).digest('base64');
            const fileText = fileBuffer.toString('utf8');

            const ourURIRecord = this.projectCache.URIRecords;

            // Check our URIRecord
            if (ourURIRecord[URI.parse(thisFPath).toString()].hash !== thisHash) {
                if (fileBuffer.includes('#macro') || fileBuffer.includes('enum')) {
                    // TODO Parse this file
                } else {
                    filesToParse.push({
                        fpath: thisFPath,
                        fullText: fileText,
                        passedHash: false
                    });
                }
            } else {
                filesToParse.push({
                    fpath: thisFPath,
                    fullText: fileText,
                    passedHash: true
                });
            }
        }

        // ! Step Four: Parse everything else!
        for (const thisFile of filesToParse) {
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
                    // TODO Parse this file
                } else {
                    // TODO Dump the URI of this File
                }
            } else {
                // TODO Parse this file
            }
        }

        // ! Step Five: Return an object to the LangServ for the FS
    }

    private async initialParseYYFile(yyFile: Resource.GMResource) {
        // Non-indexed classes:
        if (yyFile.modelName == 'GMFolder') {
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
                const fileName = this.convertEventEnumToFPath(thisEvent);
                ourReturn.push(path.join(this.projectDirectory, 'objects', yyFile.name, fileName));
            }

            return ourReturn;
        }

        // * Scripts
        if (yyFile.modelName === 'GMScript') {
            return [path.join(this.projectDirectory, 'scripts', yyFile.name, yyFile.name + '.gml')];
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
}
