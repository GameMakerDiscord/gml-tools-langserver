import { Reference, GenericResourceDescription } from './reference';
import { WorkspaceFolder } from 'vscode-languageserver';
import URI from 'vscode-uri';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { YYP } from 'yyp-typings';
import { IURIRecord, IObjects, IScriptsAndFunctions, IEnum, IMacro } from './declarations';

export namespace ProjectCache {
    export interface Cache {
        URIRecords: CacheURIRecords;
        cachedReference: CachedReferences;
        YYPHash: string;
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
            cachedReference: {
                enums: {},
                macros: {},
                object: {},
                scriptsAndFunctions: {},
                resources: []
            },
            YYPHash: ''
        };

        // Reference
        this.reference = ref;

        // Tools
        this.ourHash = crypto.createHash('sha1');
    }

    public async initializeWorkspaceFolders(workspaceFolder: WorkspaceFolder[]) {
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

        this.indexProject(path.join(this.projectDirectory, '.gml-tools', projectCache[0]));
    }

    private async indexProject(projCacheFPath: string) {
        // Get our Project Cache and Self-Validate
        this.projectCache = JSON.parse(await fse.readFile(projCacheFPath, 'utf8'));

        // Get our YYP
        const rawYYP = await fse.readFile(this.projectYYPPath, 'utf8');
        this.projectYYP = JSON.parse(rawYYP);

        /**
         * * General overview of how we parse the YYP:
         * * 1. We hash the YYP. If it's the exact same, we skip step 2, and we dump our
         * * cached reference straight into the reference class.
         *
         * * 2. If the YYP isn't the exact same, we do a first pass on each YY and GML
         * * file referenced by the YYP, filling in resource names and parentage. We also check
         * * the GML files of anything that has a GML file and we put them in a queue.
         *
         * * 3. We do a preliminary pass on each file in the queue. If they match the
         * * hash before, we skip it. If the hash doesn't match, or we don't have a hash,
         * * we index from scratch.
         *
         * * 4. We hash the file and check our save of the hash. If it's valid,
         * * then we dump our saved contents and continue on our merry way. Otherwise,
         * * we reparse the file and throw our save away.
         *
         * * 5. We pass our YYP off to the langserv, which passes it to the FS. And, we outie!
         */

        // ! Step One
        const thisYYPHash = this.ourHash.update(rawYYP).digest('base64');
        if (thisYYPHash === this.projectCache.YYPHash) {
            this.reference.dumpCachedData(this.projectCache.cachedReference);
        } else {
            // ! Step Two
        }

        //
    }
}
