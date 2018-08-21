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
		let gmlDocs = {
			functions: []
		};

		for (const thisZipEntry of yyStudioHelp.getEntries()) {
			// Is this a Scripting File?
			if (thisZipEntry.entryName.includes(normalScriptingDocs)) {
				if (thisZipEntry.isDirectory) {
					continue;
				}
				if (thisZipEntry.name == "index.html") {
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
					return: "",
					signature: "",
					link: "docs2.yoyogames.com/" + thisZipEntry.entryName
				};

				const docType = $("h3");

				// New Style Docs
				if (docType.length == 4) {
					docType.each((i, element) => {
						const data = element.firstChild.data;
						if (data === undefined) {
							return;
						}
						if (data == "Syntax:") {
							// Jump forward in the HTML two lines. This is really stupid if it works on everything.
							thisFunction.signature = element.next.next.firstChild.data;
							thisFunction.name = thisFunction.signature.slice(0, thisFunction.signature.indexOf("("));
						}

						if (data == "Returns:") {
							// Jump forward in the HTML two lines. This is really stupid if it works on everything.
							thisFunction.return = element.next.next.firstChild.data;
						}

						if (data == "Description") {
							const ourBlockQuote = element.next.next.childNodes[1];
							let output = "";

							// Iterate on our Block Quote
							for (const thisChild of ourBlockQuote.children) {
								if (thisChild.type == "text") {
									output += thisChild.data;
								}

								if (thisChild.name == "a") {
									let referenceName = thisChild.childNodes[0];
									while (referenceName.type != "text") {
										referenceName = referenceName.firstChild;
									}
									const link = thisChild.attribs["href"];
									output += "[" + referenceName.data + "](" + link + ")";
								}

								if (thisChild.name == "b") {
									output += "**" + thisChild.childNodes[0].data + "**";
								}

								if (thisChild.name == "i") {
									output += "*" + thisChild.childNodes[0].data + "*";
								}
							}
							thisFunction.documentation = output;
						}

						if (data == "Example:") {
							const ourExample = element.next.next.childNodes;
							let output = "";

							// Get our Code Example
							for (const thisExampleLine of ourExample) {
								if (thisExampleLine.type == "text") {
									output += thisExampleLine.data;
								}
							}
							thisFunction.example.code = output;

							// Now fast forward to explanation of code and clear the output:
							const description = element.next.next.next.next; // eye roll
							output = "";
							for (const thisDescLine of description.childNodes) {
								if (thisDescLine.type == "text") {
									output += thisDescLine.data.trim();
								}

								if (thisDescLine.type == "tag") {
									output += thisDescLine.firstChild.data;
								}
							}
							thisFunction.example.description = output;
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
								let foundArgument, foundDescription;
								for (const thisRow of thisTable.childNodes) {
									// We ignore text here. It's always `\n\n`.
									if (thisRow.name == "tr") {
										// We could be indexing a parameter here, so let's make a guy!
										let checkParam = false;
										let thisParameter: DocParams = {
											documentation: "",
											label: "",
											required: true
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
													// Let check where we're at in the indexing...
													if (thisParameter.label == "") {
														thisParameter.label = thisEntry.firstChild.data;
													} else {
														const ourDescription = thisEntry.firstChild.data;
														thisParameter.documentation = ourDescription;

														if (ourDescription.includes("(optional")) {
															thisParameter.required = false;
														}
													}
												}
											}
										}

										if (checkParam) {
											// TODO: We don't validate here. Should we?
											thisFunction.parameters.push(thisParameter);
										}
									}
								}
							}
						}
					} catch (error) {}
				});

				// Final Validation
				const isValid = this.functionValidator(thisFunction);

				if (isValid) {
					gmlDocs.functions.push(thisFunction);
				} else {
					console.log(this.functionValidator.errors);
				}
			}
		}
	}
}
