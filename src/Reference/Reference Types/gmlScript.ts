import { IScript, JSDOC } from '../../declarations';
import { Location, Range } from 'vscode-languageserver';
import { Callables } from '../callables';
import { GMLVarParse } from '../../diagnostic';

export class GMLScript implements IScript {
    public uri: string;
    public JSDOC: JSDOC;
    public members: { [variableName: string]: GMLVarParse };
    public referenceLocations: Location[];
    public readonly callableType: 'script' = 'script';

    readonly callables: Callables;
    readonly name: string;

    constructor(jsdoc: JSDOC, uri: string, callables: Callables, name: string) {
        this.JSDOC = jsdoc;
        this.uri = uri;
        this.referenceLocations = [];
        this.members = {};

        this.callables = callables;
        this.name = name;
    }

    public addReference(referenceURI: string, referenceRange: Range) {
        // Add to the script object
        const i = this.referenceLocations.push(Location.create(referenceURI, referenceRange)) - 1;

        // Create the Record Object if it doesn't exist
        if (!this.callables.URIRecord[referenceURI]) this.callables.reference.URIcreateURIDictEntry(referenceURI);

        this.callables.URIRecord[referenceURI].scripts.push({
            index: i,
            name: this.name
        });
    }
}
