import { DocFunctionEntry, DocParams } from "./declarations";
import * as path from "path";
import * as fse from "fs-extra";
import * as AdmZip from "adm-zip";
import { LSP } from "./lsp";
import { Reference } from "./reference";
import * as Ajv from "ajv";
import * as cheerio from "cheerio";

/**
 * The DocumentationImporter is responsible for two tasks:
 * 1. Importing the
 */
export class DocumentationImporter {
	private lsp: LSP;
	private reference: Reference;
	private functionValidator: Ajv.ValidateFunction;

	constructor(lsp: LSP, reference: Reference) {
		this.lsp = lsp;
		this.reference = reference;

		// Create our Schema Validators
		// const docsSchema = JSON.parse(fse.readFileSync(path.join(__dirname, path.normalize("../lib/schema/gmlDocsSchema.json")), "utf-8"));
		const funcSchema = JSON.parse(
			fse.readFileSync(path.join(__dirname, path.normalize("../lib/schema/functionSchema.json")), "utf-8")
		);
		const ajv = new Ajv();
		this.functionValidator = ajv.compile(funcSchema);
	}

	public async checkManual() {
		let gms2Program: string;
		switch (process.platform) {
			case "win32":
				gms2Program = path.join("C:", "Program Files", "GameMaker Studio 2");
				break;

			case "darwin":
				// Unix filesystems are weird, but also just much simpler to work this. Thanks, Unix.
				gms2Program = "/Applications/GameMaker Studio 2.app/Contents/MonoBundle";
				break;
		}

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

		// If we have no GMS2 Manual path, we stop here.
		if (!gms2Program) return;
		const ourZip = path.join(gms2Program, "chm2web", "YoYoStudioHelp.zip");
		// If someone's messed with their manual, we stop here too.
		if (!(await fse.pathExists(ourZip))) return;

		// Okay, finally, we have a path to a ZIP, which we know exists. Holy moly.
		// Let's unzip to memory using Adm-Zip:
		const yyStudioHelp = new AdmZip(ourZip);

		// Main Loop:
		// We're going to iterate on the entire contents of the ZIP file,
		// checking if we care about a file by its name.
		const normalScriptingDocs = "source/_build/3_scripting/4_gml_reference";
		const secondaryDocs = "source/_build/3_scripting/3_gml_overview";

		// Main docs
		let gmlDocs = {
			functions: []
		};

		let failureList = {
			"May have been parsed incorrectly:": [],
			"Was not Parsed; likely not a function:": []
		};

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
				const thisFunction: DocFunctionEntry = {
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
					link: "docs2.yoyogames.com/" + thisZipEntry.entryName
				};

				try {
					const docType = $("h3");

					// Covers all docs except those without "Returns" as a title.
					if (docType.length >= 3) {
						docType.each((i, element) => {
							let lastNode = this.recurseTillData(element);
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
									const thisData = this.recurseTillData(thisChild);
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
												}

												if (thisGrandChild.name == "a") {
													let referenceName = this.recurseTillData(thisGrandChild);

													const link = thisGrandChild.attribs["href"];
													output += "[" + referenceName.data + "](" + link + ")";
												}

												if (thisGrandChild.name == "b") {
													output += "**" + this.recurseTillData(thisGrandChild).data + "**";
												}

												if (thisGrandChild.name == "i") {
													output += "*" + this.recurseTillData(thisGrandChild).data + "*";
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
										const ourData = this.recurseTillData(thisExampleLine);

										if (ourData) {
											output += ourData.data;
										}
									}
									thisFunction.example.code = output.trim();

									// Now fast forward to explanation of code and clear the output:
									const description = element.next.next.next.next; // eye roll
									output = "";
									for (const thisDescLine of description.childNodes) {
										const ourText = this.recurseTillData(thisDescLine);

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
							const returns = this.recurseTillData(element);

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
											let thisParameter: DocParams = {
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
															const thisAttempt = this.recurseTillData(thisChild);
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
										if (infParam) {
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
				// Final Validation
				const isValid = this.functionValidator(thisFunction);

				if (isValid) {
					// Clean random newline characters:
					thisFunction.documentation = this.clearLineTerminators(thisFunction.documentation);
					thisFunction.signature = this.clearLineTerminators(thisFunction.signature);
					thisFunction.example.description = this.clearLineTerminators(thisFunction.example.description);
					thisFunction.name = this.clearLineTerminators(thisFunction.name);
					thisFunction.return = this.clearLineTerminators(thisFunction.return);

					for (const thisParam of thisFunction.parameters) {
						thisParam.label = this.clearLineTerminators(thisParam.label);
						thisParam.documentation = this.clearLineTerminators(thisParam.documentation);
					}

					gmlDocs.functions.push(thisFunction);
				} else {
					if (failureList["May have been parsed incorrectly:"].includes(thisFunction.name) == false) {
						failureList["Was not Parsed; likely not a function:"].push(thisFunction.name);
					}
				}
			}
		}
		fse.writeJsonSync("C:\\Resources\\work.json", gmlDocs, {
			encoding: "utf8"
		});
	}

	private recurseTillData(startNode: CheerioElement): CheerioElement | null {
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
