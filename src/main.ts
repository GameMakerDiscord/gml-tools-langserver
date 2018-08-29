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
	CompletionItem,
	CompletionList,
	TextDocumentSyncKind,
	DidChangeConfigurationNotification
} from "vscode-languageserver/lib/main";
import { LangServ } from "./langserv";

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

const lsp = new LangServ(connection);

// Initalize the Server
connection.onInitialize((params) => {
	// Tell the FS to begin indexing
	lsp.beginIndex(params.workspaceFolders);
	
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: TextDocumentSyncKind.Full,
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: ["."]
			},
			definitionProvider: true,
			hoverProvider: true,
			signatureHelpProvider: {
				triggerCharacters: ["(", ","]
			},

			executeCommandProvider: {
				commands: [
					"GMLTools.createObject",
					"GMLTools.createScript",
					"GMLTools.addEvents",
					"GMLTools.compileTestVM",
					"GMLTools.compileTestYYC",
					"GMLTools.compileExport",
					"GMLTools.forceReindex"
				]
			}
		}
	};
});

connection.onInitialized(() => {
	// Register for configuration changes:
	connection.client.register(DidChangeConfigurationNotification.type);
});

//#region Commands
connection.onExecuteCommand(async (params) => {
	switch (params.command) {
		case "GMLTools.createObject":
			const ourSprites = lsp.reference.spriteGetAllSprites().slice();
			ourSprites.push("No Sprite");
			const objInfo: any = await connection.sendRequest("createObject", { sprites: ourSprites });

			// Actually Create the Object
			if (objInfo) {
				lsp.createObject(objInfo);
			}
			break;

		case "GMLTools.createScript":
			const myScript: any = await connection.sendRequest("createScript");

			// Actually Create the Script
			if (myScript) {
				lsp.createScript(myScript);
			}
			break;

		case "GMLTools.addEvents":
			const ourEvents: any = await connection.sendNotification("addEvents");
			lsp.addEvents(ourEvents);
			break;

		case "GMLTools.compileTestVM":
			lsp.beginCompile("test", false);
			break;

		case "GMLTools.compileTestYYC":
			lsp.beginCompile("test", true);
			break;

		case "GMLTools.compileExport":
			const ourExports: any = await connection.sendRequest("compileExport");
			lsp.beginCompile(ourExports.type === "Zip" ? "zip" : "installer", ourExports.yyc === "YYC", "project_name.zip");
			break;

		case "GMLTools.forceReindex":
			lsp.forceReIndex();
			break;
	}
});

//#endregion

//#region Type Services:
connection.onCompletion(
	async (params): Promise<CompletionList | CompletionItem[] | null> => {
		return await lsp.onCompletionRequest(params);
	}
);
connection.onCompletionResolve(
	async (params): Promise<CompletionItem> => {
		return await lsp.onCompletionResolveRequest(params);
	}
);
connection.onSignatureHelp(async (params) => {
	return await lsp.onSignatureRequest(params);
});

connection.onHover((params) => {
	return lsp.hoverOnHover(params);
});

connection.onDefinition((params) => {
	return lsp.onDefinitionRequest(params);
});
//#endregion

//#region Text Events
connection.onDidChangeConfiguration(async (params) => {
	const changedImplementation = await lsp.findNewSettings();

	lsp.updateSettings(changedImplementation);
});

connection.onDidOpenTextDocument(async (params) => {
	await lsp.openTextDocument(params);
});

connection.onDidChangeTextDocument(async (params) => {
	lsp.changedTextDocument(params.textDocument.uri, params.contentChanges);
});

connection.onDidCloseTextDocument((params) => {
	connection.console.log(`${params.textDocument.uri} closed.`);
	lsp.fsManager.closeOpenDocument(params.textDocument.uri);
});

// Cache on shutdown:
connection.onShutdown(() => {
	// lsp.fsManager.cacheProject();
});
//#endregion

// Listen on the connection
connection.listen();
