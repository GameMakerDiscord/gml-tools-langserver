import {
    IPCMessageReader,
    IPCMessageWriter,
    createConnection,
    IConnection,
    CompletionItem,
    CompletionList,
    TextDocumentSyncKind,
    DidChangeConfigurationNotification,
    RequestType
} from 'vscode-languageserver/lib/main';
import { LangServ } from './langserv';
import { ClientViewNode, ResourcePackage } from './sharedTypes';

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

connection.onExecuteCommand(async params => {
    switch (params.command) {
        case 'GMLTools.compileTestVM':
            ls.beginCompile('test', false);
            break;

        case 'GMLTools.compileTestYYC':
            ls.beginCompile('test', true);
            break;

        case 'GMLTools.compileExport':
            const ourExports: any = await connection.sendRequest('compileExport');
            ls.beginCompile(ourExports.type === 'Zip' ? 'zip' : 'installer', ourExports.yyc === 'YYC', 'project_name.zip');
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
    if (ls.isServerReady() == false) {
        console.log('ERROR: Attempting to delete Script before server was ready.');
        return null;
    }

    return await ls.deleteScript(scriptPack);
});

connection.onRequest(new RequestType<ResourcePackage, ClientViewNode | null, void, void>('createEventAtUUID'), async eventPack => {
    if (ls.isServerReady() == false) {
        console.log('ERROR: Attempting to create Script before server was ready.');
        return null;
    }

    return await ls.addEvents(eventPack);
});

connection.onRequest(new RequestType<ResourcePackage, boolean, void, void>('deleteObjectAtUUID'), async objectPack => {
    if (ls.isServerReady() == false) {
        console.log('ERROR: Attempting to Delete before server was ready.');
        return false;
    }

    return await ls.deleteObject(objectPack);
});

connection.onRequest(new RequestType<ResourcePackage, boolean, void, void>('deleteEventAtUUID'), async eventPack => {
    if (ls.isServerReady() == false) {
        console.log('ERROR: Attempting to Delete before server was ready.');
        return false;
    }

    return await ls.deleteEvent(eventPack);
});

connection.onRequest(new RequestType<ResourcePackage, boolean, void, void>('createFolder'), async folderPack => {
    if (ls.isServerReady() == false) {
        console.log('ERROR: Attempting to Create Folder before Server was ready.');
        return false;
    }

    return await ls.createFolder(folderPack);
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
