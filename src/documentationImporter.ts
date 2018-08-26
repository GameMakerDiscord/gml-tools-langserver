import { GMLDocs, GMLToolsSettings } from "./declarations";
import * as path from "path";
import * as fse from "fs-extra";
import * as AdmZip from "adm-zip";
import { LangServ } from "./langserv";
import { Reference } from "./reference";
import * as Ajv from "ajv";
import * as cheerio from "cheerio";

/**
 * The DocumentationImporter is responsible for two tasks:
 * 1. Importing the
 */
export class DocumentationImporter {
	private lsp: LangServ;
	private reference: Reference;
	private functionValidator: Ajv.ValidateFunction;
	private variableValidator: Ajv.ValidateFunction;
	private UKSpellings: {
		[spelling: string]: string;
	};

	private UKSpellingsA: string[];
	constructor(lsp: LangServ, reference: Reference) {
		this.lsp = lsp;
		this.reference = reference;

		// Create our Schema Validators
		// const docsSchema = JSON.parse(fse.readFileSync(path.join(__dirname, path.normalize("../lib/schema/gmlDocsSchema.json")), "utf-8"));
		const funcSchema = JSON.parse(
			fse.readFileSync(path.join(__dirname, path.normalize("../lib/schema/functionSchema.json")), "utf-8")
		);
		const varSchema = JSON.parse(
			fse.readFileSync(path.join(__dirname, path.normalize("../lib/schema/variableSchema.json")), "utf-8")
		);

		const ajv = new Ajv();
		ajv.addMetaSchema(require("ajv/lib/refs/json-schema-draft-06.json"));
		this.functionValidator = ajv.compile(funcSchema);
		this.variableValidator = ajv.compile(varSchema);

		this.UKSpellings = {
			colour: "color",
			randomise: "randomize",
			normalised: "normalized",
			maximise: "maximized"
		};
		this.UKSpellingsA = Object.getOwnPropertyNames(this.UKSpellings);
	}

	public async createManual(): Promise<GMLDocs.DocFile> {
		// Get our path to the GMS2 Program folder. If nothing there,
		// exit early.
		const gms2FPath = await this.getManualPath();
		if (!gms2FPath) return null;

		// Find our Zip, and exit if it's null;
		const yyStudioHelp = await this.getManualZip(gms2FPath);
		if (!yyStudioHelp) return null;

		// Main Loop:
		// We're going to iterate on the entire contents of the ZIP file,
		// checking if we care about a file by its name.
		const normalScriptingDocs = "source/_build/3_scripting/4_gml_reference";
		const secondaryDocs = "source/_build/3_scripting/3_gml_overview";

		// Main docs
		let gmlDocs: GMLDocs.DocFile = {
			functions: [],
			variables: []
		};
		let failureList = {
			"May have been parsed incorrectly:": [],
			"Was not Parsed; likely not a function:": []
		};
		const hardCodedChecks = [
			"keyboard_get_map",
			"gpu_set_blendmode",
			"gpu_get_tex_mip_filter",
			"physics_particle_get_damping",
			"steam_activate_overlay"
		];

		for (const thisZipEntry of yyStudioHelp.getEntries()) {
			// Is this a Scripting File?
			if (
				thisZipEntry.entryName.includes(normalScriptingDocs) ||
				thisZipEntry.entryName.includes(secondaryDocs)
			) {
				const funcName = thisZipEntry.name;
				if (thisZipEntry.isDirectory) {
					continue;
				}
				if (funcName == "index.html") {
					continue;
				}
				if (/^[a-z_]+[a-z0-9_().]*$/i.test(funcName) == false) {
					continue;
				}
				if (funcName.includes(" ")) {
					continue;
				}
				if (funcName.includes(".png")) {
					continue;
				}
				if (funcName.includes(".gif")) {
					continue;
				}

				// Cheerio parsing
				const $ = cheerio.load(thisZipEntry.getData().toString(), {
					normalizeWhitespace: true
				});
				const thisFunction: GMLDocs.DocFunction = {
					documentation: "",
					example: {
						code: "",
						description: ""
					},
					name: "",
					parameters: [],
					minParameters: null,
					maxParameters: null,
					return: "",
					signature: "",
					link: "https://docs2.yoyogames.com/" + thisZipEntry.entryName
				};

				let resourceType: GMLDocs.DocType;

				try {
					const docType = $("h3");

					// Covers all docs except those without "Returns" as a title.
					if (docType.length >= 3) {
						docType.each((i, element) => {
							let lastNode = this.loopTilData(element);
							let data = "";
							if (lastNode) data = lastNode.data;

							if (data === undefined) {
								return;
							}

							if (data.includes("Syntax")) {
								// Jump forward in the HTML two lines. This is really stupid if it works on everything.
								const ourSignature = element.next.next;

								for (let i = 0; i < ourSignature.childNodes.length; i++) {
									const thisChild = ourSignature.childNodes[i];
									const thisData = this.loopTilData(thisChild);
									if (thisData) {
										thisFunction.signature += thisData.data.trim();
									}

									// Literally only happens once in `display_set_gui_maximize`
									// thanks GM Manual!
									if (thisChild.name == "i") {
										if (!thisFunction.minParameters) {
											thisFunction.minParameters = i;
										}
									}
								}

								// Check if this is a variable or a Function:
								const isFunction = thisFunction.signature.includes("(");

								if (isFunction) {
									resourceType = GMLDocs.DocType.function;
									thisFunction.name = thisFunction.signature.slice(
										0,
										thisFunction.signature.indexOf("(")
									);
									// Parse for optional/limitless parameters:
									let commas = 0;
									let openBracket;

									for (const thisChar of thisFunction.signature) {
										if (thisChar == ",") {
											commas++;
										}
										if (thisChar == "[" && !openBracket) {
											openBracket = commas;
										}
									}

									// Figure out our Max Parameters
									if (commas > 0) {
										commas++;
										thisFunction.maxParameters = commas;
									}

									if (commas == 0) {
										if (thisFunction.signature.includes("()") == false) {
											thisFunction.maxParameters = 1;
										} else {
											thisFunction.maxParameters = 0;
										}
									}

									// Figure out our Min Parameters
									if (openBracket !== undefined) {
										thisFunction.minParameters = openBracket;
									} else if (!thisFunction.minParameters)
										thisFunction.minParameters = thisFunction.maxParameters;
								} else {
									// cutt off the semicolon
									thisFunction.name = thisFunction.signature.slice(0, -1);
									resourceType = GMLDocs.DocType.variable;
								}
							}

							if (data.includes("Returns")) {
								// Jump forward in the HTML two lines. This is really stupid if it works on everything.
								thisFunction.return = element.next.next.firstChild.data;
							}

							if (data.includes("Description")) {
								try {
									const ourBlockQuote = element.next.next.childNodes;
									let output = "";

									// Iterate on this Block Quotation:
									for (const thisChild of ourBlockQuote) {
										// Iterate on our Parent Node (basically tags)
										const thisParent = thisChild.childNodes;
										if (thisParent) {
											for (const thisGrandChild of thisParent) {
												if (thisGrandChild.type == "text") {
													output += thisGrandChild.data;
												} else if (thisGrandChild.name == "a") {
													let referenceName = this.loopTilData(thisGrandChild);

													const link = thisGrandChild.attribs["href"];
													output += "[" + referenceName.data + "](" + link + ")";
												} else if (thisGrandChild.name == "b") {
													output += "**" + this.loopTilData(thisGrandChild).data + "**";
												} else if (thisGrandChild.name == "i") {
													output += "*" + this.loopTilData(thisGrandChild).data + "*";
												} else {
													const isData = this.loopTilData(thisGrandChild);
													if (isData) {
														output += isData.data;
													}
												}
											}
										} else {
											if (thisChild.type == "text") {
												output += thisChild.data;
											}
										}
									}
									thisFunction.documentation = output.trim();
								} catch (err) {
									failureList["May have been parsed incorrectly:"].push(thisFunction.name);
								}
							}

							if (data.includes("Example")) {
								if (thisFunction.name == "achievement_get_challenges") {
									console.log("check");
								}
								try {
									const ourExample = element.next.next.childNodes;
									let output = "";

									// Get our Code Example
									for (const thisExampleLine of ourExample) {
										const ourData = this.loopTilData(thisExampleLine);

										if (ourData) {
											output += ourData.data;
										}
									}
									thisFunction.example.code = output.trim();

									// Now fast forward to explanation of code and clear the output:
									const description = element.next.next.next.next; // eye roll
									output = "";
									for (const thisDescLine of description.childNodes) {
										const ourText = this.loopTilData(thisDescLine);

										if (ourText) {
											output += ourText.data;
										}
									}
									thisFunction.example.description = output.trim();
								} catch (err) {
									failureList["May have been parsed incorrectly:"].push(thisFunction.name);
								}
							}
						});
					}

					// Special Return Case because I hate Mark Alexander
					if (docType.length == 3) {
						const allParagraphs = $("p");

						allParagraphs.each((i, element) => {
							const returns = this.loopTilData(element);

							if (returns && returns.data == "Returns:") {
								thisFunction.return = element.childNodes[1].data.trim();
								return;
							}
						});
					}

					// Get Parameter Information
					const paramTable = $("table");

					paramTable.each((i, element) => {
						// Try to confirm that this is our Param table:
						// We do a try/catch because there's a high chance if there's
						// another table that we get a type-error here.
						try {
							// First, we iterate over all the tables:
							for (const thisTable of element.childNodes) {
								// Within each table, we check the `tbody` of each. This is the *actual* table.
								if (thisTable.name == "tbody") {
									// Iterate on the Rows of the Table.
									let foundArgument, foundDescription, infParam;
									for (const thisRow of thisTable.childNodes) {
										// We ignore text here. It's always `\n\n`.
										if (thisRow.name == "tr") {
											// We could be indexing a parameter here, so let's make a guy!
											let checkParam = false;
											let thisParameter: GMLDocs.DocParams = {
												documentation: "",
												label: ""
											};

											for (const thisEntry of thisRow.childNodes) {
												// HEADER ROW
												if (thisEntry.name == "th") {
													const headerTitle = thisEntry.firstChild.data;
													if (headerTitle == "Argument") {
														foundArgument = true;
													}

													if (headerTitle == "Description") {
														foundDescription = true;
													}
													// Continue so we don't accidentally call our
													// header a parameter with the below!
													continue;
												}

												// NORMAL ROWS
												if (foundArgument && foundDescription) {
													if (thisEntry.name == "td") {
														checkParam = true;
														// Okay, we're finally here, now's our big moment.
														let output = "";

														for (const thisChild of thisEntry.childNodes) {
															const thisAttempt = this.loopTilData(thisChild);
															if (thisAttempt) {
																output += thisAttempt.data;
															}
														}

														thisParameter.label == ""
															? (thisParameter.label = output)
															: (thisParameter.documentation = output);
													}
												}
											}

											if (checkParam) {
												// VALIDATE FOR INFINITY FUNCTIONS:
												if (thisParameter.label.includes("...")) {
													thisFunction.maxParameters = 9999;
													infParam = thisFunction.parameters.length;
												}
												thisFunction.parameters.push(thisParameter);
											}
										}
									}

									// INFINITY FUNCTIONS!
									if (thisFunction.maxParameters == 9999) {
										// We check infParam again because having two tables, where
										// the first table is the Arguments table, messes this up.
										if (infParam !== undefined) {
											thisFunction.minParameters = infParam;
										}
									}
								}
							}
						} catch (error) {
							failureList["May have been parsed incorrectly:"].push(thisFunction.name);
						}
					});
				} catch (err) {
					failureList["May have been parsed incorrectly:"].push(thisFunction.name);
				}
				// Final Validation For Functions:
				if (resourceType == GMLDocs.DocType.function) {
					const isValid = await this.functionValidator(thisFunction);

					if (isValid) {
						// Clean random newline characters:
						thisFunction.documentation = this.clearLineTerminators(thisFunction.documentation);
						thisFunction.signature = this.clearLineTerminators(thisFunction.signature);
						thisFunction.example.description = this.clearLineTerminators(thisFunction.example.description);
						thisFunction.name = this.clearLineTerminators(thisFunction.name);
						thisFunction.return = this.clearLineTerminators(thisFunction.return);

						// clear spaces :eye roll: from our links:
						thisFunction.link = thisFunction.link.replace(/[ ]/g, "%20");

						for (const thisParam of thisFunction.parameters) {
							thisParam.label = this.clearLineTerminators(thisParam.label);
							thisParam.documentation = this.clearLineTerminators(thisParam.documentation);
						}

						// HARDCODED CHECKS: One day we'll abstract there, but here are errors we couldn't fix.
						if (hardCodedChecks.includes(thisFunction.name)) {
							const h2 = $("h2");
							const ourText = this.loopTilData(h2[0]);
							if (ourText) {
								thisFunction.name = ourText.data;
							}
						}

						// Duplicate check
						let cont = false;
						for (const thisSavedFunc of gmlDocs.functions) {
							if (thisSavedFunc.name == thisFunction.name) {
								cont = true;
								console.log("Found duplicate name at :" + thisFunction.link);
								break;
							}
						}
						if (cont) continue;

						// Stupid, stupid British spelling Check for the bipsy bopsy little crumpet men:
						for (const thisSpelling of this.UKSpellingsA) {
							if (thisFunction.name.includes(thisSpelling)) {
								const americanVersion = Object.assign({}, thisFunction);

								// Rename :eye-roll:
								americanVersion.name = americanVersion.name.replace(
									thisSpelling,
									this.UKSpellings[thisSpelling]
								);
								americanVersion.signature = americanVersion.signature.replace(
									thisSpelling,
									this.UKSpellings[thisSpelling]
								);
								americanVersion.return = americanVersion.return.replace(
									thisSpelling,
									this.UKSpellings[thisSpelling]
								);

								// Figure out the Right spelling
								if (
									this.lsp.userSettings.preferredSpellings ==
									GMLToolsSettings.SpellingSettings.british
								) {
									americanVersion.doNotAutoComplete = true;
								} else if (
									this.lsp.userSettings.preferredSpellings ==
									GMLToolsSettings.SpellingSettings.american
								) {
									thisFunction.doNotAutoComplete = true;
								}
								gmlDocs.functions.push(americanVersion);
							}
						}

						// Commit our Main Function here
						gmlDocs.functions.push(thisFunction);
					} else {
						// Push our *invalid* functions here.
						if (failureList["May have been parsed incorrectly:"].includes(thisFunction.name) == false) {
							failureList["Was not Parsed; likely not a function:"].push(thisFunction.name);
						}
					}
				}

				if (resourceType == GMLDocs.DocType.variable) {
					// Create our Variable
					const thisVar: GMLDocs.DocVariable = {
						documentation: this.clearLineTerminators(thisFunction.documentation),
						example: {
							code: thisFunction.example.code,
							description: this.clearLineTerminators(thisFunction.example.description)
						},
						link: thisFunction.link,
						name: this.clearLineTerminators(thisFunction.name),
						object: "*",
						type: this.clearLineTerminators(thisFunction.return)
					};

					if (this.variableValidator(thisVar)) {
						// Stupid, stupid British spelling Check:
						for (const thisSpelling of this.UKSpellingsA) {
							if (thisVar.name.includes(thisSpelling)) {
								const americanVersion = Object.assign({}, thisVar);

								// Rename :eye-roll:
								americanVersion.name = americanVersion.name.replace(
									thisSpelling,
									this.UKSpellings[thisSpelling]
								);
								americanVersion.type = americanVersion.type.replace(
									thisSpelling,
									this.UKSpellings[thisSpelling]
								);
								americanVersion.link = americanVersion.link.replace(
									thisSpelling,
									this.UKSpellings[thisSpelling]
								);

								gmlDocs.variables.push(americanVersion);
								thisVar.doNotAutoComplete = true;
							}
						}

						gmlDocs.variables.push(thisVar);
					} else {
						// Push our *invalid* functions here.
						if (failureList["May have been parsed incorrectly:"].includes(thisVar.name) == false) {
							failureList["Was not Parsed; likely not a function:"].push(thisVar.name);
						}
					}
				}
			}
		}

		return gmlDocs;
	}

	private async getManualPath(): Promise<string> {
		let gms2Program =
			process.platform == "win32"
				? path.join("C:", "Program Files", "GameMaker Studio 2")
				: "/Applications/GameMaker Studio 2.app/Contents/MonoBundle";

		if (gms2Program && fse.existsSync(gms2Program)) {
			this.lsp.connection.window.showInformationMessage(
				'GMS2 Manual found at default location. Indexing manual to "./.gml-tools". Please hold...'
			);
		} else {
			const test = await this.lsp.connection.sendRequest("requestImportManual");
			if (test == "Okay") {
				// Returns a URI:
				gms2Program = (await this.lsp.connection.sendRequest("importManual")).toString();
			}
		}

		return gms2Program;
	}

	private async getManualZip(fpath: string) {
		const ourZip = path.join(fpath, "chm2web", "YoYoStudioHelp.zip");
		// If someone's messed with their manual, we stop here too.
		if (!(await fse.pathExists(ourZip))) return null;

		// Okay, finally, we have a path to a ZIP, which we know exists. Holy moly.
		// Let's unzip to memory using Adm-Zip:
		return new AdmZip(ourZip);
	}

	private loopTilData(startNode: CheerioElement): CheerioElement | null {
		let recurseHere = startNode;

		while (recurseHere.type != "text") {
			recurseHere = recurseHere.firstChild;

			if (!recurseHere) {
				return null;
			}
		}
		return recurseHere;
	}

	private clearLineTerminators(data: string): string {
		return data.replace(/\r?\n|\r/g, " ");
	}
}
