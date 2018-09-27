import { MacroPackage } from "./diagnostic";
import { CompletionItemKind } from "vscode-languageserver";

export const enum ResourceType {
	Object = 0,
	Script = 1,
	Sprite = 2
}

export interface Token {
	tokenName: string;
	startIdx: number;
	length: number;
}

export const enum SignatureWalkState {
	FINAL_OPEN = 0,
	FINAL_FUNC = 1,
	INTERMEDIARY_OPEN = 2
}

export const enum TokenNames {
	comma = "comma",
	oParens = "oParens",
	cParens = "cParens",
	funcIdentifier = "funcIdentifier"
}

export const enum LanguageService {
	GMLDefinitionProvider = 0,
	GMLSignatureProvider = 1,
	GMLCompletionProvider = 2,
	GMLHoverProvider = 3,
	FileSystem = 4,
	Reference = 5
}

export const enum SemanticsOption {
	Function = 1,
	Variable = 2,
	JavaDoc = 4,
	All = Function | Variable | JavaDoc
}

export interface IGMLDocumentation {
	[key: string]: IGMLDoc;
}

export interface IGMLDoc {
	parameters: Array<IParameter>;
	example: IExample;
	signature: string;
	documentation: string;
	return: string;
}

export interface IParameter {
	label: string;
	documentation: string;
	type: null;
}

export interface IExample {
	code: string;
	description: string;
}

export interface CreateObjPackage {
	objectName: string;
	objectEvents: string | string[];
	sprite: string;
}

export interface AddEventsPackage {
	uri: string;
	events: string[];
}

export type enumsMacros = [string[], MacroPackage[]];

export type OtherResources = [string[], CompletionItemKind];

/**
 * Namespace describing all GMLDocs interfaces.
 */
export namespace GMLDocs {
	/**
	 * This describes the saved DocFile we create.
	 */
	export interface DocFile {
		functions: DocFunction[];
		variables: DocVariable[];
	}

	/**
	 * Scrapped Documentation Function information.
	 */
	export interface DocFunction {
		name: string;
		signature: string;
		parameters: DocParams[];
		minParameters: number;
		maxParameters: number;
		example: DocExample;
		documentation: string;
		return: string;
		link: string;
		doNotAutoComplete?: boolean;
	}
	/**
	 * Scrapped Documentation Variable information.
	 */
	export interface DocVariable {
		name: string;
		example: DocExample;
		documentation: string;
		type: string;
		link: string;
		object: string;
		doNotAutoComplete?: boolean;
	}

	/**
	 * Scrapped Documentation Parameter information.
	 */
	export interface DocParams {
		label: string;
		documentation: string;
	}
	/**
	 * Scrapped Documentation Example information.
	 */
	export interface DocExample {
		code: string;
		description: string;
	}

	/**
	 * Enum used very briefly in the `documentationImporter` to
	 * differentiate functions and variables by the presence of
	 * "()" in their "signature" property.
	 */
	export const enum DocType {
		function = 0,
		variable = 1
	}
}

export namespace GMLToolsSettings {
	export interface Config {
		preferredSpellings: SpellingSettings;
		numberOfDocumentationSentences: number;
		[someString: string]: any;
	}

	export const enum SpellingSettings {
		american = "American",
		british = "British",
		noPref = "No Preference"
	}
}
export declare type ResourceNames =
	| "objects"
	| "rooms"
	| "sprites"
	| "sounds"
	| "paths"
	| "views"
	| "scripts"
	| "fonts"
	| "timelines"
	| "tilesets"
	| "notes"
	| "extensions"
	| "shaders"
	| "datafiles_yy";
