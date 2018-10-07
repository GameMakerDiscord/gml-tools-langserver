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
            URIRecords: {}
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
         * *    we index from scratch.
         *
         * * 4. We hash the file and check our save of the hash. If it's valid,
         * *    then we dump our saved contents and continue on our merry way. Otherwise,
         * *    we reparse the file and throw our save away.
         *
         * * 5. We pass our YYP off to the langserv, which passes it to the FS. And, we outie!
         */

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
        const ourGMLFilePath: string[] = [];
        for (const thisYY of projectYYs) {
            const ourGMLFiles = await this.initialGetGMLFiles(thisYY);
        }
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
        // Early exit
        if (yyFile.modelName === 'GMObject') {
            const ourReturn = [];
            
            
        }

        return [];
    }


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
}
