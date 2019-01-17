import { IFunction, JSDOC } from '../../declarations';
import { Callables } from '../callables';
import { GMLVarParse } from '../../diagnostic';
import { Location, Range } from 'vscode-languageserver';

export class GMLFunction implements IFunction {
    public JSDOC: JSDOC;
    public members: { [variableName: string]: GMLVarParse };
    public referenceLocations: Location[];
    public doNotAutoComplete: boolean;
    public readonly callableType: 'function' = 'function';

    readonly callables: Callables;
    readonly name: string;

    constructor(jsdoc: JSDOC, callables: Callables, name: string, doNotAutoComplete: boolean) {
        this.JSDOC = jsdoc;
        this.callables = callables;
        this.name = name;
        this.doNotAutoComplete = doNotAutoComplete;

        this.members = {};
        this.referenceLocations = [];
    }

    public addReference(referenceURI: string, referenceRange: Range) {
        const i = this.referenceLocations.push(Location.create(referenceURI, referenceRange)) - 1;

        // Create the Record Object if it doesn't exist
        if (!this.callables.URIRecord[referenceURI]) this.callables.reference.URIcreateURIDictEntry(referenceURI);
        this.callables.URIRecord[referenceURI].functions.push({
            index: i,
            name: this.name
        });
    }
}
