import {
    IPCMessageReader,
    IPCMessageWriter,
    createConnection,
    IConnection,
    CompletionItem,
    CompletionList,
    TextDocumentSyncKind,
    DidChangeConfigurationNotification,
    RequestType,
    RequestType0
} from 'vscode-languageserver/lib/main';
import { LangServ } from './langserv';
import { ClientViewNode, ResourcePackage } from './sharedTypes';
import { CreateObjPackage } from './declarations';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

const ls = new LangServ(connection);

// Initalize the Server
connection.onInitialize(params => {
    // Tell the FS to begin indexing
    // We've got no backup plan if the client doesn't support Workspaces!
    if (params.workspaceFolders) {
        ls.workspaceBegin(params.workspaceFolders);
    }

    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.']
            },
            definitionProvider: true,
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ',']
            },
            referencesProvider: true,

            executeCommandProvider: {
                commands: [
                    'GMLTools.createObject',
                    'GMLTools.createScript',
                    'GMLTools.addEvents',
                    'GMLTools.compileTestVM',
                    'GMLTools.compileTestYYC',
                    'GMLTools.compileExport',
                    'GMLTools.forceReindex'
                ]
            }
        }
    };
});

connection.onInitialized(async () => {
    // Register for configuration changes:
    connection.client.register(DidChangeConfigurationNotification.type);

    // Let the Client Know:
    connection.sendNotification('indexComplete');
    console.log('Language Server is ready.');
});

//#region Commands
const CREATE_OBJECT = new RequestType<{ sprites: string[] }, CreateObjPackage | null, void, void>('createObject');
const CREATE_SCRIPT = new RequestType0<string | null, void, void>('createScript');
// const ADD_EVENTS = new RequestType0<EventsPackage | null, void, void>('addEvents');

connection.onExecuteCommand(async params => {
    switch (params.command) {
        case 'GMLTools.createObject':
            const ourSprites = ls.reference.getAllResourceOfType('GMSprite');
            ourSprites.push('No Sprite');
            const objInfo = await connection.sendRequest(CREATE_OBJECT, { sprites: ourSprites });

            // Actually Create the Object
            if (objInfo) {
                // ls.createObject(objInfo);
            }
            break;

        case 'GMLTools.createScript':
            const myScript = await connection.sendRequest(CREATE_SCRIPT);

            // Actually Create the Script
            if (myScript) {
                // ls.createScript(myScript);
            }
            break;

        case 'GMLTools.addEvents':
            // const ourEvents: any = await connection.sendRequest(ADD_EVENTS);
            // ls.addEvents(ourEvents);
            break;

        case 'GMLTools.compileTestVM':
            ls.beginCompile('test', false);
            break;

        case 'GMLTools.compileTestYYC':
            ls.beginCompile('test', true);
            break;

        case 'GMLTools.compileExport':
            const ourExports: any = await connection.sendRequest('compileExport');
            ls.beginCompile(
                ourExports.type === 'Zip' ? 'zip' : 'installer',
                ourExports.yyc === 'YYC',
                'project_name.zip'
            );
            break;

        // case 'GMLTools.forceReindex':
        //     ls.forceReIndex();
        //     break;
    }
});

connection.onRequest(new RequestType<string, ClientViewNode[], void, void>('getViewsAtUUID'), uuid => {
    if (ls.isServerReady() == false) {
        console.log('ERROR: Client requested views before views were indexed. Empty array provided.');
        return [];
    }

    // If initial views
    if (uuid == 'init') {
        const ourViews = ls.fsManager.viewsGetInitialViews();
        if (ourViews) {
            return ourViews;
        }
    } else {
        const ourViews = ls.fsManager.viewsGetThisViewClient(uuid);
        if (ourViews) {
            return ourViews;
        }
    }

    // Failure:
    return [];
});

connection.onRequest(
    new RequestType<ResourcePackage, ClientViewNode | null, void, void>('createScriptAtUUID'),
    async (scriptPack: ResourcePackage) => {
        if (ls.isServerReady() == false) {
            console.log('ERROR: Attempting to create Script before server was ready.');
            return null;
        }

        return await ls.createScript(scriptPack);
    }
);

connection.onRequest(
    new RequestType<ResourcePackage, ClientViewNode | null, void, void>('createObjectAtUUID'),
    async (objectPack: ResourcePackage) => {
        if (ls.isServerReady() == false) {
            console.log('ERROR: Attempting to create Script before server was ready.');
            return null;
        }

        return await ls.createObject(objectPack);
    }
);

connection.onRequest(new RequestType<ResourcePackage, boolean, void, void>('deleteScriptAtUUID'), async scriptPack => {
    return await ls.deleteScript(scriptPack);
});

//#endregion

//#region Type Services:
connection.onCompletion(
    async (params): Promise<CompletionList | CompletionItem[] | null> => {
        return await ls.onCompletionRequest(params);
    }
);
connection.onCompletionResolve(
    async (params): Promise<CompletionItem> => {
        return await ls.onCompletionResolveRequest(params);
    }
);
connection.onSignatureHelp(async params => {
    return await ls.onSignatureRequest(params);
});

connection.onHover(async params => {
    return await ls.hoverOnHover(params);
});

connection.onDefinition(params => {
    return ls.onDefinitionRequest(params);
});

connection.onReferences(async params => {
    return await ls.onShowAllReferences(params);
});
//#endregion

//#region Text Events
connection.onDidChangeConfiguration(async params => {
    const changedImplementation = await ls.findNewSettings();

    ls.updateSettings(changedImplementation);
});

connection.onDidOpenTextDocument(async params => {
    await ls.openTextDocument(params);
});

connection.onDidChangeTextDocument(async params => {
    ls.changedTextDocument(params.textDocument.uri, params.contentChanges);
});

connection.onDidCloseTextDocument(params => {
    connection.console.log(`${params.textDocument.uri} closed.`);
    ls.fsManager.closeOpenDocument(params.textDocument.uri);
});

// Cache on shutdown:
connection.onShutdown(async () => {
    await ls.cacheProject();
});
//#endregion

// Listen on the connection
connection.listen();
