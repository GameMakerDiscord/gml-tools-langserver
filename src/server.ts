/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";
import {
    IPCMessageReader,
    IPCMessageWriter,
    createConnection,
    IConnection,
    TextDocuments,
    CompletionItem,
    CompletionList
} from "vscode-languageserver/lib/main";
import { LSP } from "./lsp";

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. TODO: MAKE THIS BETTER.
let documents = new TextDocuments();
documents.listen(connection);

const lsp = new LSP(connection);


// var shouldSendDiagnosticRelatedInformation: boolean = false;

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
connection.onInitialize(
    (params) => {
        // shouldSendDiagnosticRelatedInformation = params.capabilities && params.capabilities.textDocument 
        // && params.capabilities.textDocument.publishDiagnostics 
        // && params.capabilities.textDocument.publishDiagnostics.relatedInformation;
        connection.window.showInformationMessage("Indexing Project, please hold...");
        lsp.beginIndex(params.workspaceFolders);
        
        return {
            capabilities: {
                // Tell the client that the server works in FULL text document sync mode
                textDocumentSync: documents.syncKind,
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: ["."]
                },
                definitionProvider: true,
                hoverProvider: true,
                signatureHelpProvider: {
                    triggerCharacters: ["(",","]
                },
                executeCommandProvider: {
                    commands: [
                        "GMLTools.createObject",
                        "GMLTools.createScript",
                        "GMLTools.addEvents",
                        "GMLTools.compile",
                        "GMLTools.forceReindex"
                    ]
                }
            }
        };
    }
);

//#region Commands
connection.onExecuteCommand((params) => {
    if (params.command == "GMLTools.createObject") {
        connection.sendNotification("createObject");
    }

    switch (params.command) {
        case "GMLTools.createObject":
            const ourSprites = lsp.reference.spriteGetAllSprites().slice();
            ourSprites.push("No Sprite");
            connection.sendNotification("createObject", { sprites: ourSprites });
            break;
        
        case "GMLTools.createScript":
            connection.sendNotification("createScript");
            break;
        
        case "GMLTools.addEvents":
            connection.sendNotification("addEvents");
            break;
        
        case "GMLTools.compile":
            lsp.beginCompile();
            break;
        
        case "GMLTools.forceReindex":
            lsp.forceReIndex();
    }
})

connection.onNotification("createObject", (params: any) => {
    lsp.createObject(params);
})

connection.onNotification("createScript", async (params: string) => {
    await lsp.createScript(params);
});

connection.onNotification("addEvents", async (params: any) => {
    await lsp.addEvents(params);
})
//#endregion


//#region Type Services:
connection.onCompletion(async (params): Promise<CompletionList|CompletionItem[]|null> => {
    return await lsp.onCompletionRequest(params);
});
connection.onCompletionResolve(async (params): Promise<CompletionItem> => {
    return await lsp.onCompletionResolveRequest(params);
});
connection.onSignatureHelp(async (params) => {
    return await lsp.onSignatureRequest(params);
});

connection.onHover((params) => {
    return lsp.hoverOnHover(params);
})

connection.onDefinition((params) =>  {
    return lsp.onDefinitionRequest(params);
})
//#endregion

//#region Text Events
connection.onDidChangeConfiguration((_) => {
    // Revalidate any open text documents
    // let allDocs = documents.all();
});

connection.onDidOpenTextDocument(async (params) => {
    await lsp.openTextDocument(params.textDocument.uri, params.textDocument.text);
});

connection.onDidChangeTextDocument(async params => {
    await lsp.changedTextDocument(params.textDocument.uri, params.contentChanges);
});

connection.onDidCloseTextDocument(params => {
    connection.console.log(`${params.textDocument.uri} closed.`);
    lsp.fsManager.closeOpenDocument(params.textDocument.uri);
});

// Cache on shutdown:
connection.onShutdown(() => {
    lsp.fsManager.cacheProject();
});
//#endregion


// Make the text document manager listen on the connection
// for open, change and close text document events

// Listen on the connection
connection.listen();

